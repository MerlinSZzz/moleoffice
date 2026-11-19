// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Resource routes: what a session started, what is still alive, and the one way to kill it.
 *
 *   POST /api/resources                  write down something this session started
 *   GET  /api/resources                  the whole ledger, with what is alive right now
 *   POST /api/resources/sweep            close ended runs' gone process rows, without a signal
 *   GET  /api/resources/orphans          what is alive whose owning session has ended, with the
 *                                        exact description of each and whether it can be released
 *   GET  /api/resources/scan             the raw machine reading, registered or not
 *   GET  /api/resources/servers          every Mole Office dev-stack process running here, and who
 *                                        owns each one — reports only, acts on nothing
 *   POST /api/resources/:id/release      kill it, by process GROUP, attributed in the change log; or,
 *                                        with {"signalNothing":true} from the session that registered
 *                                        it, close the row and leave the process as it is
 *   POST /api/resources/:id/withdraw     take back a row that should never have been written; it
 *                                        signals nothing and only the row is closed
 *
 * ---------------------------------------------------------------------------------------
 * THE RELEASE CONTRACT
 * ---------------------------------------------------------------------------------------
 *
 * "Only expose release/kill when the server can return the exact command/process description
 *  being acted on."
 *
 * So this file may only offer a kill it can SAY. Every orphan carries `describe` — the command,
 * the pid, the process group and how long it has been up — and `releaseAction`, which is null
 * whenever any field of it cannot be filled honestly. Null means the interface shows no button;
 * `releaseBlockedBecause` says why in a sentence, so a missing button is never a mystery. Locks
 * are always null: Mole Office does not delete lock files.
 *
 * `alsoAffects` lists every OTHER process in the group, because killing a group kills its
 * children and the person confirming has to see that before they confirm, not after. A group
 * whose members cannot be listed still gets no button at all — see ENUMERATING A PROCESS GROUP
 * below for the one case where that can still happen.
 *
 * Releasing takes back the sentence it was shown, under "expect". The release re-reads the
 * machine, rebuilds that sentence, and only acts when the two are identical:
 *
 *   409  the resource moved between the read and the release — pid recycled, port changed
 *        hands, process left the group, session came back to life. Says which. Kills nothing.
 *   400  the sentence sent is not the sentence this release would act on now. The caller is
 *        holding a stale reading of the machine, which is how the wrong thing gets killed.
 *
 * This project has already acted on a stale reading: an orphaned server holding a DELETED
 * database served stale data into a diagnosis that was written down and worked from. The whole
 * of the above is that afternoon, turned into code.
 *
 * WHY THE CONFIRM PHRASE HOLDS START TIMES AND NOT UPTIMES. `describe` says "up 10d20h" because
 * that is what a person reads. The phrase says "started 2026-07-28 14:02:11" instead, because a
 * phrase containing an uptime changes on its own: a person who reads the screen, thinks for two
 * minutes and then confirms would get a 400 for nothing, learn that 400s here are noise, and
 * start retrying past them. Everything in the phrase is a fact that only changes when the thing
 * itself changes.
 *
 * ---------------------------------------------------------------------------------------
 * ENUMERATING A PROCESS GROUP — THE SEAM IS CLOSED
 * ---------------------------------------------------------------------------------------
 *
 * `alsoAffects` needs every process in a group, and `OsProbe` can list one. The method is
 * `processesInGroup(pgid)`, declared at src/server/lib/resources.ts:162 and implemented on
 * LINUX_PROBE at :424 by walking /proc and keeping the entries whose stat pgrp field matches.
 * So process, port and GPU orphans DO carry a `releaseAction`, and the kill buttons appear.
 *
 * That is checked against the real operating system, not against a fake. The `against the real
 * operating system` block in tests/release.test.ts starts a detached shell with two `sleep`
 * children, registers the leader, ends its session, and asserts the orphan comes back with a
 * kill action naming both children by pid. A kill on this machine can state its own consequences
 * before it happens.
 *
 * WHAT THIS SECTION USED TO SAY, AND WHY THAT IS RECORDED RATHER THAN DELETED. It was headed
 * "THE SEAM GAP" and said `OsProbe` could not enumerate a group, so no button was ever offered
 * for a process, a port or a GPU. That was true when it was written and stopped being true when
 * `processesInGroup` landed. Nothing failed in between, because prose cannot fail a build — so
 * the most prominent comment in this file told every reader that a working feature was broken.
 * That is the defect this codebase keeps finding, in the one form the test suite cannot catch.
 *
 * ONE PATH STILL REFUSES, AND IT IS NOT A GAP. `groupAwareProbe` below tests for the method at
 * run time even though the interface requires it, because the probe is an object chosen at run
 * time and an object can be handed in that does not implement it. tests/release.test.ts does
 * exactly that on purpose, to drive the refusal and check its wording. A real probe on this
 * machine never takes that path. Containers never needed it — stopping one affects that
 * container and nothing else on the host.
 *
 * THE REFUSAL SENTENCE IN `killAction` SAID THE SAME OUT-OF-DATE THING AND HAS BEEN REWRITTEN.
 * It told a reader that `OsProbe` "has no way to enumerate a process group" and that adding
 * `processesInGroup(pgid)` would make the button appear. The method is there. It now names the
 * narrower fact that is true when the branch fires — the probe installed in THIS server does not
 * implement the method — and says the Linux probe does. tests/release.test.ts asserts the new
 * wording.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS LOGIC IS IN A ROUTE FILE
 * ---------------------------------------------------------------------------------------
 *
 * The house rule is that no work happens in a route file: a handler works out who is asking,
 * checks the input, and calls one function in lib/. Describing and confirming below breaks it.
 *
 * The reason it broke the rule has expired. It was written when lib/resources.ts belonged to
 * another agent and could not be touched; that file has been edited since — `processesInGroup`
 * was added to it — so nothing is stopping the move any more. It is simply outstanding, which
 * is a smaller and more honest thing to say than the sentence that used to be here.
 *
 * The move itself has not changed. Everything between "THE RELEASE CONTRACT" and "ROUTES" goes
 * beside `releaseResource` in lib/resources.ts, whose refusals it deliberately mirrors, and the
 * handlers here go back to two lines each. Nothing below reaches past `osProbe()`, so it is a
 * cut and paste. It is the same fold-back the deleted api/layout.ts wrote down for its CREATE TABLE.
 *
 * ---------------------------------------------------------------------------------------
 * KILLING IS A POST, ALWAYS EXPLICIT, AND NEVER A SIDE EFFECT
 * ---------------------------------------------------------------------------------------
 *
 * GET /api/resources/orphans changes nothing. There is no query parameter that makes it tidy
 * up and no `?release=true`. Closing ended runs’ gone rows is an explicit POST to /api/resources/sweep.
 * The only thing that kills is a POST to a single resource id, and it writes a row to the change log naming
 * who asked and the sentence they confirmed. Report; do not reap: an automatic reaper would
 * eventually kill the simulation that was deliberately left running for eleven days, and nobody
 * would trust the button again.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THESE ROUTES ARE REGISTERED
 * ---------------------------------------------------------------------------------------
 *
 * src/server/index.ts registers them under /api, as a dynamic `await import` like its
 * neighbours. That import must stay dynamic for the reason the comment above them gives: this
 * file reaches the database, and the database client reads MOLE_OFFICE_DB the moment it is imported,
 * which must not happen before .env is loaded.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { actorFrom, explain } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { type Actor } from '../lib/records.ts'
import { resolveSessionRef } from '../lib/resolve-session-ref.ts'
import { PanelError } from '../lib/panel-error.ts'
import { parseStoredStamp } from '@shared/time.ts'
import type { World } from '@shared/runtime.ts'
import { WORLD_HEADER, parseWorldHeader } from '../../config/world-header.mjs'
import { theWorldThatHeaderDescribes } from '../lib/world.ts'
import { readTheProgramBehind } from '../lib/from-a-sandbox.ts'
import { route } from '../lib/route.ts'
import { theWorkerWeStarted } from '../lib/worker.ts'
import { theSystemFor } from '../../config/systems/the-system.mjs'
import {
  RESOURCE_TYPES,
  listResources,
  orphanReport,
  osProbe,
  readAProcess,
  readFirst,
  registerResource,
  releaseResource,
  scanMachine,
  serversOnThisMachine,
  sweepTheGoneProcessRowsOfEndedRuns,
  theProcessesAListingReads,
  theProcessesARegistrationReads,
  theRowIsAboutThisProcess,
  whatHoldsIt,
  withdrawRowRegisteredByMistake,
  whyARowWithNoStartTimeIsNotSignalled,
  type LedgerEntry,
  type EndedRunRows,
  type OrphanReport,
  type OsProbe,
  type OsPort,
  type OsProcess,
  type OsScan,
  type RegisterInput,
  type ReleaseResult,
  type ResourceReport,
  type ResourceType,
  type ServerReport,
  type UnclaimedSweep,
  type WhatHoldsIt,
  type WithdrawnRow,
} from '../lib/resources.ts'
import { oneReadingPerListing } from '../db/the-processes-a-listing-reads.ts'

// ---------------------------------------------------------------------------- input shapes

/**
 * `key` is text for every type, deliberately.
 *
 * A pid and a port are numbers, a container name and a lock path are not, and one field that
 * changes type depending on a sibling field is the kind of shape that produces a 400 nobody can
 * read. It arrives as text and lib/resources.ts checks it against the type — where the error
 * message can say "a port key (the port number) must be a whole number, and it was ...".
 */
const registerBody = z.strictObject({
  /**
   * OPTIONAL, because the caller has usually said this already.
   *
   * Every write carries `x-mole-office-session`, and lib/http.ts puts it on the actor. Requiring the
   * same session a second time in the body made registering cost one more field than it needed
   * to, and registering has to be CHEAP or it gets skipped — a process nobody registered cannot
   * be reported as an orphan, which is the whole of what this ledger is for.
   *
   * It stays available because the two are not always the same session: a supervisor writing as
   * itself may register something it started on another session's behalf, and that is not a thing
   * to infer from a header. When both are present the body wins, because it is the more specific
   * statement. See `ownerSessionRecord` for what happens when neither is usable — it is a refusal
   * with a sentence, never a default.
   */
  sessionRecordId: z
    .string({ error: 'sessionRecordId must be the id of the session record that started this, as text' })
    .trim()
    .min(1, { error: 'sessionRecordId must not be empty' })
    .optional(),
  type: z.enum(RESOURCE_TYPES, {
    error:
      `type must be one of: ${RESOURCE_TYPES.join(', ')} — process and gpu take a pid, port takes a port ` +
      'number, container takes its name, lock takes an absolute path, client takes the pid of a window or other ' +
      'program that only connects to the office, and a slot is asked for at POST /api/slots/acquire',
  }),
  /**
   * The pid, the port number, the container name or the lock's absolute path, as THIS machine names
   * it. Optional only because a process inside a container may be named by the two fields below
   * instead; the refinement at the end of this schema still says `key is required` when neither is
   * sent, so an empty body is answered with every field it lacks in one refusal.
   */
  key: z.string({ error: 'key is required and must be text' }).min(1, { error: 'key must not be empty' }).optional(),
  /**
   * A PROCESS INSIDE A CONTAINER, NAMED THE WAY IT KNOWS ITSELF: the container's name or full id, and
   * the pid the container gives it. Sent in place of `key`, for a `process` row only.
   *
   * A process in a sandbox knows only its own pid there. The server finds the same process as this
   * machine numbers it, through the container's pid namespace, and stores the host pid, process
   * group and start time, so a release stops it by group across the container boundary. The reply's
   * `resource.key` and `resource.pgid` are those host numbers, and `resource.detail` names the
   * container and the pid inside it. The rules about the pair live in `theContainerHalfOf` in
   * lib/resources.ts, not here.
   *
   * A start time sent beside it in `osStartedAt` should carry its zone (an ISO 8601 stamp ending in Z
   * or an offset): a container's local zone is often not this machine's.
   */
  container: z
    .string({ error: 'container must be the container name or full id, as text' })
    .trim()
    .min(1, { error: 'container must not be empty — leave the key out instead' })
    .optional(),
  pidInContainer: z
    .union([z.number(), z.string()], { error: 'pidInContainer must be the pid as the container sees it, a whole number' })
    .optional(),
  /**
   * Free text. Blank is refused for the same reason a blank summary is on a record: it renders
   * as a gap that reads as missing information. Leave the key out instead — for a process the
   * real command line is recorded, which is better than anything a caller would have typed.
   */
  detail: z
    .string({ error: 'detail must be text' })
    .refine((s) => s.trim() !== '', {
      error:
        'detail must be a non-empty string, but it is blank. A blank value renders as a gap that reads as ' +
        'missing information; leave the key out instead, and for a process the real command line is used.',
    })
    .optional(),
  /**
   * WHICH WORLD THIS PROCESS SERVES, as the `x-mole-office-world` header spells it.
   *
   * Criterion G5 asks that every registered process say which world it serves. Only a Mole Office
   * API can read its OWN checkout and database, and it registers itself through
   * `POST /api/runtime/register`. Everything else — a Vite, an agent's server — can read the world
   * header off a reply from the Mole Office it serves, and this is where it hands that over. The
   * format is read by `parseWorldHeader` in src/config/world-header.mjs, which is the only reader
   * of it anywhere, so there is no second idea here of what a world on a wire looks like.
   *
   * LEAVING IT OUT IS NEVER A REFUSAL. The route tries to work it out (see `theWorldOfWhatIsBeing
   * Registered`), and a row it could not work out is stored with `world: null` and named as such by
   * `node tools/listeners.mjs`. That is the owner's F1 answer:
   * naming only. A registration refused for want of a world would be a process nobody wrote down.
   */
  world: z
    .string({ error: 'world must be the value of an x-mole-office-world header, as text' })
    .min(1, { error: 'world must not be empty — leave the key out instead' })
    .optional(),
  /**
   * WHETHER MOLE OFFICE ITSELF STARTED THIS PROCESS, which is what makes it stoppable from here.
   *
   * The owner's F1 answer of 3 September 2026: the product names what it did not start and never stops it.
   * So the row has to say how the process came to exist, and only whoever started it knows. Until
   * 4 September the only door that took this was `POST /api/runtime/register`, where a process
   * registers ITSELF — and the message worker registers a run it started a moment ago, which is a
   * different process. Hence this key.
   *
   * IT IS A CLAIM, AND THAT IS THE SAME TRUST THE OTHER DOOR ALREADY GIVES. What it buys a caller
   * is the right to have Mole Office stop that process, which is a thing the caller could do itself
   * by group. Leaving it out stores NULL, and null is not "no": it is nobody wrote it down, and the
   * stop door treats it the same way it treats no.
   */
  startedByTheProduct: z.boolean({ error: 'startedByTheProduct must be true or false' }).optional(),
  /**
   * WHEN THE CALLER READ THE PROCESS AS STARTING, checked against /proc and then discarded.
   *
   * `osStartedAt` is what `GET /api/resources` calls the stored value, so a caller re-registering a
   * process it read there sends the same word back. It is checked against the start time the
   * machine reports now: a mismatch means the pid was reused between the caller's reading and this
   * call, and the row would name a stranger. The value is not stored — the machine's own reading is.
   *
   * The check is proven in tests/the-process-start-time-beside-the-pid.test.ts.
   */
  osStartedAt: z
    .string({ error: 'osStartedAt must be the start time you read, as text' })
    .trim()
    .min(1, { error: 'osStartedAt must not be empty — leave the key out instead' })
    .optional(),
  /**
   * WHY THIS SESSION IS TAKING ON A PROCESS IT DID NOT START (decision AOwsOHMVq6Ce, problem JmaDkej3InKw).
   *
   * A pid that started before the owning session's record was filed is refused without it, in words naming both start
   * times: a process the session started itself cannot be older than the session, so an older one was found, and a pid
   * found by a pattern once led a builder to kill a server it did not start. With it the row is written and its
   * `detail` begins with the reason. The rule lives in `aProcessOlderThanItsSession` in lib/resources.ts.
   */
  adopting: z
    .string({ error: 'adopting must say, as text, why this session is taking on a process it did not start' })
    .trim()
    .min(1, { error: 'adopting must not be empty — say why this session is taking on the process, or leave the key out' })
    .optional(),
}).refine((body) => body.key !== undefined || body.container !== undefined || body.pidInContainer !== undefined, {
  path: ['key'],
  error:
    'key is required and must be text — or, for a process inside a container, send container and pidInContainer ' +
    'in its place',
  // Asked even when another field has already failed, so that `{}` is told about `key` in the same
  // refusal that tells it about `type` and the owner.
  when: (payload) => typeof payload.value === 'object' && payload.value !== null && !Array.isArray(payload.value),
})

const releaseBody = z
  .strictObject({
    /**
     * The confirmPhrase the caller was shown, sent back verbatim.
     *
     * Not `confirm: true`. A boolean proves somebody clicked; the sentence proves they were
     * looking at THIS reading of the machine when they did, which is the only thing that
     * distinguishes a confirmed kill from a confident one.
     */
    expect: z
      .string({ error: 'expect must be the confirmPhrase you were shown, as text' })
      .refine((s) => s.trim() !== '', {
        error:
          'expect must not be blank. Send back the confirmPhrase from GET /api/resources/orphans exactly as it ' +
          'was given, or leave the key out entirely.',
      })
      .optional(),
    signal: z.enum(['SIGTERM', 'SIGKILL'], {
      error:
        'signal must be SIGTERM or SIGKILL. SIGTERM is the default and lets the process shut down; SIGKILL is ' +
        'the second decision, made after SIGTERM was reported as ignored.',
    }).optional(),
    force: z
      .boolean({ error: 'force must be true or false' })
      .optional(),
    /**
     * Close the row and signal nothing. Only the session that registered the row may send it, and it
     * cannot be sent with `expect`, `signal` or `force`, which are all about a signal.
     */
    signalNothing: z
      .boolean({ error: 'signalNothing must be true or false' })
      .optional(),
    note: z
      .string({ error: 'note must be text' })
      .refine((s) => s.trim() !== '', { error: 'note must not be blank — leave the key out instead' })
      .optional(),
  })
  // A body is optional on this route, so `null` and `undefined` both mean "no options".
  .nullish()

/**
 * Which session record owns this registration: the one the body names, or the one the caller is
 * already writing as.
 *
 * The fallback resolves the header the same way the change log does — `x-mole-office-session` may be a
 * session record's id OR a run name that has been bound to one, and a caller that had to know
 * which of the two it was holding would have been handed a puzzle instead of an endpoint.
 *
 * Nothing here is a default. If there is no header, or the header names a session Mole Office has
 * never been told about, this refuses and says which of the two happened and what to send. A
 * ledger row filed against a guessed owner would answer "has the owner ended" about the wrong
 * session, and that answer is the only thing this ledger is read for.
 *
 * Exported for `POST /api/slots/acquire` in api/slots.ts, which writes a ledger row too and has to
 * find its owner the same way.
 */
export function ownerSessionRecord(given: string | undefined, actor: Actor, workspaceId: string): string {
  if (given !== undefined) return given

  const problem = ownerProblem({ sessionRecordId: given }, actor, workspaceId)
  if (problem !== null) throw new PanelError(problem.message, problem.status)

  // ownerProblem returned null, so the header resolves. Asking again is one lookup, and it keeps
  // the two answers from being able to differ.
  const header = (actor.sessionId ?? '').trim()
  const recordId = resolveSessionRef(header, workspaceId).recordId
  if (recordId === null) throw new PanelError(`x-mole-office-session "${header}" no longer resolves.`, 404)
  return recordId
}

/**
 * Why this request has no usable owner, or null when it has one.
 *
 * Split out of `ownerSessionRecord` so the body validator can say the same thing WITHOUT
 * throwing: a caller sending `{}` to find out what this endpoint wants has to be told about the
 * owner in that same refusal, not on a second attempt.
 */
function ownerProblem(
  body: unknown,
  actor: Actor,
  /**
   * WHICH PROJECT THE SESSION IS LOOKED FOR IN, and it used to be the string `'default'`.
   *
   * `resolveSessionRef` filters strictly on the workspace, and since the corpus migration the
   * default project holds no sessions at all — so the header path of this route answered 404 for
   * every session that exists, in every project, with the sentence "no session record has that id,
   * answers to that name, or is titled that". Measured 2026-08-12 against a real `panelx` session
   * id: 404 by header, 201 with the same id in the body.
   *
   * That is the one write the agent skill orders before anything else, for a stated reason — five
   * orphaned-process incidents here, one of which served a deleted database into a written-down
   * diagnosis — and the refusal reads as the caller's own mistake. Filed as problem 18OltSw2aOMw.
   * The row itself is filed into `workspaceOf(req)` a few lines further down, so this was also the
   * two halves of one request disagreeing about which project it was in.
   */
  workspaceId: string,
): { message: string; status: number } | null {
  // A body naming the session outright answers the question, whatever the header says. Read
  // defensively: this runs BEFORE the body has been validated.
  const given = (body as { sessionRecordId?: unknown } | null | undefined)?.sessionRecordId
  if (typeof given === 'string' && given.trim() !== '') return null

  // Blank counts as absent: lib/http.ts already turns an empty header into null, and a caller
  // reaching this function directly with "   " means the same thing it does over HTTP.
  const header = actor.sessionId?.trim() ? actor.sessionId.trim() : null
  if (header === null) {
    return {
      status: 400,
      message:
        'This registration says nothing about which session started the resource: `sessionRecordId` was left ' +
        'out of the body and no x-mole-office-session header was sent. Send either — the header is the cheaper ' +
        'one, and it is the same header every other write of yours already carries. The ledger exists to ' +
        'answer "has the session that started this ended", so a row with no owner could never be an orphan.',
    }
  }

  const ref = resolveSessionRef(header, workspaceId)
  if (ref.recordId !== null) return null
  return {
    status: 404,
    message:
      `x-mole-office-session is "${header}", and no session record IN THIS PROJECT has that id, answers to that name, or is ` +
      `titled that — so there is nothing to own this resource. File the session first and it becomes the ` +
      `owner of everything you write under that name: POST /api/records ` +
      `{"kind":"session","title":"…","data":{"state":"running"}} with the same header, which binds ` +
      `"${header}" to the new record. Or name the session outright here with ` +
      `{"sessionRecordId":"<its record id>"}.`,
  }
}

/**
 * Check the registration body, and say the owner's part in the SAME refusal when there is one.
 *
 * Two things are wrong with `{}` sent by an agent that has not filed its session: the body has no
 * `type` and no `key`, and nothing owns the row. Reporting them one at a time turns a documented
 * single round trip into three requests, so they are reported together.
 */
function parseRegisterBody(
  body: unknown,
  owner: { message: string; status: number } | null,
): z.output<typeof registerBody> {
  const result = registerBody.safeParse(body)
  if (result.success) return result.data
  const fields = explain(result.error)
  throw new PanelError(
    owner === null
      ? `The request body is not usable: ${fields}`
      : `The request body is not usable: ${fields}. And it has no owner: ${owner.message}`,
  )
}

/**
 * WHICH CONTAINER'S PROGRAM SENT A PROCESS ROW, when one did (problems xnfjNO3w2GCQ and ytWensT7blOP). Only a process row,
 * and only a request a listener carried, is asked: one made in the office's own process (a script, a test's inject) is
 * the office's. The operating system says which program holds the connection. One in a container this server is not in
 * names itself by its pid on this machine: a bare pid it sent is read in its own pid namespace, and a container it names
 * must be its own. A program on this computer is answered as before, whatever container it names, as the launcher on
 * the host does. A caller the office cannot place is refused in both forms, because a pid or a container it names could
 * be anybody's. Off Linux, a run of the message worker this server started is taken from it
 * (`aRunOfTheWorkerThisServerStarted`).
 */
async function whatTheDoorMakesOfTheCaller(
  req: FastifyRequest,
  actor: Actor,
  body: z.output<typeof registerBody>,
): Promise<Pick<RegisterInput, 'sentFromAContainerBy' | 'processTheDoorRead'>> {
  if (body.type !== 'process') return {}
  const containerForm = body.container !== undefined || body.pidInContainer !== undefined
  if (!containerForm && body.key === undefined) return {}
  if (actor.from === undefined) return {}
  const program = await readTheProgramBehind(req)
  if (program === null) {
    // Not on Linux, whose words stay as they were: there the door places every program of this computer's user, so a
    // caller it cannot place is another user's program, or one whose connection was not read in time.
    const open = !containerForm && osProbe().platform !== 'linux'
    const run = open ? await aRunOfTheWorkerThisServerStarted(body) : null
    if (run !== null) return { processTheDoorRead: run }
    throw new PanelError(
      'Mole Office could not find which program on this computer sent this, so it cannot tell ' +
        (containerForm
          ? `whether container ${String(body.container)} is the sender's own`
          : `whether pid ${String(body.key).trim()} is this machine's number or a container's`) +
        ', and nothing was written. A process in a sandbox is registered by the launcher on the host, or by a program ' +
        "in the sandbox that runs as this computer's user, which the office can find." +
        (open
          ? ' From a program the office cannot find, a bare pid is taken only when this computer reads it as a child ' +
            'of the message worker this server started, sent without adopting.'
          : ''),
      409,
    )
  }
  return program.inAnotherContainer ? { sentFromAContainerBy: { callerPid: program.pid } } : {}
}

/**
 * A RUN OF THE MESSAGE WORKER THIS SERVER STARTED, sent as a bare pid by a caller the office cannot place, or null.
 *
 * Windows cannot say which program holds a connection, and a Mac says it only for its own window's helper. So the
 * worker's own registration of a run it had started was refused, and the worker stopped the run again, on every pass
 * (wave 13t, round W9, on a Windows 11 machine). This one case is opened off Linux, and no other: the pid, read on this
 * machine, is a child of the worker this server started. It opens nothing to a sandbox, whose programs this server did
 * not start.
 *
 * The worker is the pid this server recorded when it started it. Where a start makes a starter that makes the group
 * (`jobObjects`, src/config/systems/the-system.mjs), the recorded pid is the worker's starter, and the worker is the
 * starter's child, so the run's parent is read as well. Each process is read once. The process read here is handed to the
 * registration, which reads its start time from it and refuses a process that started before the session was filed.
 * adopting is refused here, because it would let such a process through.
 */
async function aRunOfTheWorkerThisServerStarted(body: z.output<typeof registerBody>): Promise<OsProcess | null> {
  if (body.adopting !== undefined) return null
  const worker = theWorkerWeStarted().pid
  if (worker === null) return null
  const pid = Number(String(body.key).trim())
  if (!Number.isSafeInteger(pid) || pid <= 0) return null
  const probe = osProbe()
  const proc = await readAProcess(pid, probe)
  if (proc === null) return null
  if (theSystemFor(probe.platform).groups.jobObjects === null) return proc.ppid === worker ? proc : null
  const parent = await readAProcess(proc.ppid, probe)
  return parent !== null && parent.ppid === worker ? proc : null
}

const idParams = z.object({
  id: z.string().trim().min(1, { error: 'the URL must contain a resource id' }),
})

const ledgerQuery = z.strictObject({
  sessionRecordId: z.string().min(1, { error: 'sessionRecordId must not be empty' }).optional(),
  /**
   * Query strings are text, so the two spellings a caller will actually send are both accepted
   * and anything else is refused rather than quietly read as false.
   */
  includeReleased: z
    .enum(['true', 'false'], { error: 'includeReleased must be true or false' })
    .transform((v) => v === 'true')
    .optional(),
  /**
   * One process group's rows. The data-folder move needs the rows of the office supervisor's group, and the
   * whole ledger of a long-used office is longer than a tool's request helper hands back. Group 0 and group 1
   * are never a session's own, so they are refused rather than answered with nothing.
   */
  pgid: z
    .string()
    .regex(/^[1-9]\d*$/, { error: 'pgid must be a process group number, such as 4242' })
    .transform(Number)
    .refine((n) => Number.isSafeInteger(n) && n >= 2, { error: 'pgid must be a process group number of 2 or more' })
    .optional(),
})

/**
 * WHAT A CLEANUP ASKS ABOUT: port numbers, comma-separated, and one database file by its absolute path.
 * A relative path is refused rather than resolved against this server's own directory, which is not
 * the caller's.
 */
const holdingQuery = z
  .strictObject({
    ports: z
      .string()
      .transform((text) => text.split(',').map((one) => one.trim()))
      .pipe(
        z.array(
          z
            .string()
            .regex(/^\d+$/, { error: 'ports is port numbers separated by commas, such as 3000,3001' })
            .transform(Number)
            .pipe(z.number().int().min(1).max(65535, { error: 'a port number is between 1 and 65535' })),
        ),
      )
      .optional(),
    database: z
      .string()
      .refine((path) => isAbsolute(path), { error: 'database is the absolute path of a database file' })
      .optional(),
  })
  .refine((q) => q.ports !== undefined || q.database !== undefined, {
    error: 'Name what the cleanup would free or remove: ?ports=<n>,<n> and/or ?database=<absolute path>.',
  })

// ============================================================================ the release contract

/** The same five words the ledger uses, under the name the contract gives them. */
export type OrphanKind = ResourceType

export type KillSignal = 'SIGTERM' | 'SIGKILL'

/**
 * What may be done to a resource. `stop` is a container; everything else dies by signal.
 *
 * A VALUE, so the browser's copy can be pinned to it by a test — see tests/vocabulary.test.ts.
 * It was an inline union on `ReleaseAction.verb` below, mirrored by a hand-written
 * `RELEASE_VERBS` array in src/web/components/SessionPanel.tsx with nothing holding the two
 * together: a third verb added here would have been rejected by the panel's own reader and
 * printed as a problem, which is how a working button becomes a warning nobody can act on.
 */
export const RELEASE_VERBS = ['kill', 'stop'] as const
export type ReleaseVerb = (typeof RELEASE_VERBS)[number]

/** What releasing this resource would do, in enough detail to confirm it. */
export interface ReleaseAction {
  verb: ReleaseVerb
  /** What is acted on, e.g. "process group 3302496" or "container growlab". */
  target: string
  /** Only on a kill. Which signal is sent. */
  signal?: string
  /**
   * Every OTHER process in the group, described the way `describe` describes the target.
   * Killing a group kills the children, and that has to be on screen before the confirmation,
   * not in the outcome afterwards.
   */
  alsoAffects: string[]
  /** One sentence the interface shows verbatim, and the caller sends back to act. */
  confirmPhrase: string
}

/**
 * One thing left running by a session that has ended.
 *
 * It carries the whole ledger row as well as the contract's fields, so nothing a caller already
 * reads disappeared when this shape arrived.
 */
export interface Orphan extends ResourceReport {
  kind: OrphanKind
  /** Exact and specific: the command, the pid, the process group, and how long it has been up. */
  describe: string
  /** How long it has been running unowned — measured from the moment its session ended. */
  ageSeconds: number
  sessionId: string | null
  sessionTitle: string | null
  /** Null means NOT releasable, and the interface must not offer a button. */
  releaseAction: ReleaseAction | null
  /**
   * Why there is no releaseAction, in a sentence. Null when there is one.
   *
   * Not in the contract, and here anyway: a button that quietly is not there is the same
   * failure as a wrong reading. The person needs to know whether Mole Office is refusing, or cannot
   * see, and what to do by hand either way.
   */
  releaseBlockedBecause: string | null
}

/**
 * The orphans report, narrowed to the fields the running column reads and nothing else.
 *
 * THE WHOLE `OrphanReport` USED TO BE SENT. The page reads `orphans`, `searched`, `warning` and
 * `unclaimed` and never looked at `checkedAt`, `platform`, `stillOwned`, `goneAndNotClosed` or the
 * top-level `unchecked`; on the owner's live office those unread lists made every answer about 76 KB on
 * every visible page. A field nothing reads is weight the reader pays for, so the answer carries
 * exactly the four the page uses (problem aHdrneS3NBGF). `orphanReport` in lib/resources.ts still
 * builds the whole report; this is the door's narrowed copy of it.
 */
export interface OrphansResponse {
  orphans: Orphan[]
  /** Where this report actually looked. An empty place cannot be told from an unsearched one. */
  searched: string[]
  /** Present only when something could not be checked, or an age had to be measured differently. */
  warning?: string
  /** Alive on this machine, and no live ledger row claims it. Read and drawn by the column. */
  unclaimed: UnclaimedSweep
}

/** What a release did. The contract's `released`, plus the ledger's own result. */
export interface ReleaseResponse extends ReleaseResult {
  released: true
  /** The description of the thing acted on, from the reading taken at release time. */
  description: string
  /** Everything that is now gone. Empty when nothing had to die. */
  killed: string[]
  /** Anything that was signalled and is still there. Empty is the normal case. */
  survived: string[]
  /** The sentence that was confirmed, or null when none was needed. */
  confirmed: string | null
}

/** What a withdrawal did. `withdrawn` rather than `released`, because nothing was stopped. */
export interface WithdrawResponse extends WithdrawnRow {
  withdrawn: true
}

/**
 * WHY A ROW SHOULD NEVER HAVE BEEN WRITTEN, in the caller's own words.
 *
 * Required, and it may not be blank. A row taken off the ledger with nothing said is
 * indistinguishable a month later from a row somebody tidied away, and this door exists precisely
 * because those two are different facts.
 */
const withdrawBody = z.strictObject({
  because: z
    .string()
    .trim()
    .min(1, { error: 'because must say why this row should never have been written' }),
})

/**
 * The part of the operating-system interface this contract needs in order to offer a kill.
 *
 * `OsProbe` declares `processesInGroup` itself now, so this adds nothing to it and every probe
 * the product builds satisfies it. It stays because the check below is a RUNTIME one: the probe
 * is an object chosen at runtime, and a caller can hand in one that does not implement the
 * method whatever its declared type says. tests/release.test.ts hands in exactly such a probe to
 * drive the refusal. A probe that implements this gets kill buttons; one that does not gets a
 * sentence saying so. See ENUMERATING A PROCESS GROUP at the top.
 */
export interface GroupAwareProbe extends OsProbe {
  processesInGroup(pgid: number): OsProcess[]
}

function groupAwareProbe(probe: OsProbe): GroupAwareProbe | null {
  const candidate = probe as Partial<GroupAwareProbe>
  return typeof candidate.processesInGroup === 'function' ? (probe as GroupAwareProbe) : null
}

// ---------------------------------------------------------------------------- times

/**
 * Read one of Mole Office's own timestamps back into milliseconds.
 *
 * The old comment here said "when this moves into lib/, this copy goes". It has moved, further
 * than lib/ — the rule is in `@shared/time.ts` now, because the browser needs it too and one of
 * the browser's copies had drifted to UTC. So the copy is gone.
 */
const timeOf = parseStoredStamp

/**
 * "10d20h", "3h12m", "45m", "20s" — how long something has been up.
 *
 * Null when the start time could not be read. A process whose uptime cannot be stated cannot be
 * described to the contract's standard, and so is not offered a button; reporting "up 0s" for an
 * eleven-day simulation is exactly the reading that hid one for eleven days.
 */
function upFor(startedAt: string, at: number): string | null {
  const then = timeOf(startedAt)
  if (then === null) return null
  const seconds = Math.max(0, Math.floor((at - then) / 1000))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d${hours}h`
  if (hours > 0) return `${hours}h${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}

/** How a live process reads on screen: "node src/server/index.ts — pid 3302512, group 3302496, up 10d20h". */
function liveDescription(p: OsProcess, at: number): string | null {
  const up = upFor(p.startedAt, at)
  if (up === null) return null
  return `${p.command} — pid ${p.pid}, group ${p.pgid}, up ${up}`
}

/**
 * How a process reads in a confirm phrase: the same facts, with the start time instead of the
 * uptime, so the sentence does not change while somebody is reading it.
 */
function identityOf(p: OsProcess): string {
  return `${p.command} — pid ${p.pid}, group ${p.pgid}, started ${p.startedAt}`
}

// ---------------------------------------------------------------------------- describing

/** What the server can say about one resource, and whether it can offer to release it. */
interface ResourceView {
  describe: string
  action: ReleaseAction | null
  /** Why there is no action. Null exactly when `action` is not null. */
  blocked: string | null
  /**
   * The processes a kill would signal — the target first, then its group-mates. Read before the
   * kill so that afterwards each one can be checked individually rather than assumed dead.
   */
  targets: OsProcess[]
}

function describedOnly(describe: string, blocked: string): ResourceView {
  return { describe, action: null, blocked, targets: [] }
}

/**
 * Build the kill action for a process group, refusing wherever lib/resources.ts would refuse.
 *
 * The refusals are deliberately the same ones releaseResource makes, because a button that
 * produces a 409 when it is pressed is worse than no button: it teaches the person that the
 * refusals are noise.
 */
function killAction(
  target: OsProcess,
  recordedPgid: number | null,
  probe: OsProbe,
  at: number,
  signal: KillSignal,
  /** For a port row: the port this group is holding, which is how a person recognises it. */
  freeing: string | null,
): { action: ReleaseAction; targets: OsProcess[] } | { blocked: string } {
  if (recordedPgid === null) {
    return {
      blocked:
        `No process group was recorded for this when it was registered, so there is no group to signal. Pid ` +
        `${target.pid} is in group ${target.pgid} now: "${target.command}". Kill it by hand if it is yours.`,
    }
  }
  if (target.pgid !== recordedPgid) {
    return {
      blocked:
        `This was registered in process group ${recordedPgid} and pid ${target.pid} is in group ${target.pgid} ` +
        'now. Signalling the recorded group could hit processes that have nothing to do with this, and ' +
        'signalling the new one could hit its new group-mates. Deal with it by hand.',
    }
  }
  if (recordedPgid <= 1) {
    return { blocked: `Process group ${recordedPgid} is init, or every process there is. Mole Office will not signal it.` }
  }
  let own: number
  try {
    own = probe.ownProcessGroup()
  } catch (err) {
    return {
      blocked:
        'Mole Office could not read its own process group, so it cannot prove this kill would not kill the server ' +
        `answering you: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  if (recordedPgid === own) {
    return {
      blocked:
        `Process group ${recordedPgid} is Mole Office's own, so releasing this would kill the server answering the ` +
        'request. Whatever registered it was mistaken about what it started.',
    }
  }

  const groupReader = groupAwareProbe(probe)
  if (groupReader === null) {
    // THIS SENTENCE USED TO NAME THE WRONG CAUSE. It said `OsProbe` had no way to enumerate a
    // process group and that adding `processesInGroup(pgid)` was what would make the button
    // appear. That was true when it was written; the method landed, LINUX_PROBE implements it,
    // and the sentence went on telling every reader that a working feature was missing. What is
    // actually true when this branch fires is narrower and more useful: the probe INSTALLED RIGHT
    // NOW does not implement the method, which on this machine means a fake one is in place.
    return {
      blocked:
        `Mole Office cannot list the other processes in group ${recordedPgid}, so it cannot say what else killing that ` +
        'group would end — and it will not offer a kill it cannot describe. The operating-system probe installed ' +
        `in this server (platform "${probe.platform}") does not implement processesInGroup(pgid), which is the one ` +
        'method that answers "what else is in this group". The Linux probe does implement it, so a server reading ' +
        'this machine would offer the button. Meanwhile, look first and do it by hand: ' +
        `ps -o pid,pgid,cmd -g ${recordedPgid}   then   kill -TERM -${recordedPgid}`,
    }
  }

  const members = groupReader.processesInGroup(recordedPgid)
  if (!members.some((m) => m.pid === target.pid)) {
    // Two readings of the same machine disagreeing is not a thing to average out. One of them is
    // wrong and neither can be trusted to aim a kill.
    return {
      blocked:
        `The process table says pid ${target.pid} is in group ${recordedPgid}, and listing that group does not ` +
        'include it. Two readings of the same machine disagree, so Mole Office will not signal anything until one of ' +
        'them can be trusted.',
    }
  }

  const others = members
    .filter((m) => m.pid !== target.pid)
    .sort((a, b) => a.pid - b.pid)
  const alsoAffects: string[] = []
  for (const other of others) {
    const described = liveDescription(other, at)
    if (described === null) {
      return {
        blocked:
          `Pid ${other.pid} is in group ${recordedPgid} and its start time reads "${other.startedAt}", which is not ` +
          'a time, so Mole Office cannot say how long it has been up. Killing the group would end it too, and an ' +
          'unnameable casualty is not something to confirm.',
      }
    }
    alsoAffects.push(described)
  }

  const groupTarget = `process group ${recordedPgid}`
  const tail =
    others.length === 0
      ? 'and nothing else is in that group'
      : `and ${others.length} other ${others.length === 1 ? 'process' : 'processes'} in that group: ` +
        others.map(identityOf).join('; ')
  const confirmPhrase =
    `Kill ${groupTarget} with ${signal}${freeing === null ? '' : `, freeing ${freeing}`}, ending ` +
    `${identityOf(target)}, ${tail}.`

  return {
    action: { verb: 'kill', target: groupTarget, signal, alsoAffects, confirmPhrase },
    targets: [target, ...others],
  }
}

/** A process or GPU row: both are a pid, and both are killed by their group. */
function processView(report: ResourceReport, probe: OsProbe, at: number, signal: KillSignal): ResourceView {
  const pid = Number(report.key)
  const live = probe.processById(pid)
  if (live === null) {
    return describedOnly(
      `${report.detail} — pid ${pid}, which is not running any more`,
      `Nothing is running as pid ${pid} now, so there is nothing to kill. Release it with no "expect" to tidy the ` +
        'ledger row, which records that it was already gone.',
    )
  }
  if (theRowIsAboutThisProcess(report.osStartedAt, live).same === false) {
    // The number came back round. Everything below this line would be aimed at a stranger.
    return describedOnly(
      `pid ${pid} is now "${live.command}", started ${live.startedAt} — NOT the process this session registered, ` +
        `which started ${report.osStartedAt}`,
      `Pid ${pid} has been recycled: the process this session started has exited and the operating system has ` +
        'given its number to something else. Mole Office will not signal it. Release it with no "expect" to tidy the ' +
        'ledger row.',
    )
  }
  // No start time on the row, so no kill is offered: the release would refuse it. Problem `HfYQOmmx97wT`.
  if (report.osStartedAt === null) {
    return describedOnly(
      `${report.detail} — pid ${pid} is "${live.command}", started ${live.startedAt}, and the row has no start time to compare`,
      whyARowWithNoStartTimeIsNotSignalled(report, live),
    )
  }

  const described = liveDescription(live, at)
  if (described === null) {
    return describedOnly(
      `${live.command} — pid ${live.pid}, group ${live.pgid}, started "${live.startedAt}", which is not a time`,
      `The start time of pid ${pid} reads "${live.startedAt}", which is not a time, so Mole Office cannot say how long ` +
        'it has been up and will not offer a kill it cannot describe.',
    )
  }

  // The GPU reading comes from the report rather than a second nvidia-smi, which costs a
  // subprocess per row. It is descriptive only: nothing below aims a signal with it.
  let describe = described
  if (report.type === 'gpu') {
    const memory = report.gpuMemory
    if (memory !== null && 'usedMib' in memory) describe += `, holding ${memory.usedMib} MiB of GPU memory`
    else if (memory !== null) describe += `, GPU memory unread: ${memory.unknown}`
  }

  const built = killAction(live, report.pgid, probe, at, signal, null)
  if ('blocked' in built) return describedOnly(describe, built.blocked)
  return { describe, action: built.action, blocked: null, targets: built.targets }
}

function portView(report: ResourceReport, probe: OsProbe, at: number, signal: KillSignal): ResourceView {
  const port = Number(report.key)
  const held = probe.listeningOn === undefined ? probe.listeningPorts().filter((p) => p.port === port) : probe.listeningOn(port)
  if (held.length === 0) {
    return describedOnly(
      `${report.detail} — nothing is listening on port ${port} any more`,
      `Nothing is listening on port ${port} now, so there is nothing to kill. Release it with no "expect" to tidy ` +
        'the ledger row.',
    )
  }
  const where = held.map((p) => `${p.address}:${p.port}/${p.protocol}`).join(', ')
  const holder = held.find((p) => p.pid !== null)?.pid ?? null
  if (holder === null) {
    return describedOnly(
      `port ${port} (${where}) is held by a process this user may not inspect`,
      `Port ${port} is held by a process Mole Office cannot read, so it cannot tell whether it is the one this session ` +
        'started, and will not signal it.',
    )
  }
  const live = probe.processById(holder)
  if (live === null) {
    return describedOnly(
      `port ${port} (${where}) is held by pid ${holder}, which could not be read back`,
      `Port ${port} is held by pid ${holder}, and that process could not be read a moment later, so Mole Office cannot ` +
        'describe what killing it would end.',
    )
  }
  if (theRowIsAboutThisProcess(report.osStartedAt, live).same === false) {
    return describedOnly(
      `port ${port} (${where}) is now held by "${live.command}", pid ${live.pid}, started ${live.startedAt} — NOT ` +
        `the process this session registered, which started ${report.osStartedAt}`,
      `Port ${port} has changed hands since it was registered. Killing the process holding it now would kill ` +
        "somebody else's server. Mole Office will not do it. Release it with no \"expect\" to close the ledger row " +
        'without signalling anything.',
    )
  }
  // No start time on the row, so no kill is offered: the release would refuse it. Problem `HfYQOmmx97wT`.
  if (report.osStartedAt === null) {
    return describedOnly(
      `port ${port} (${where}) is held by "${live.command}", pid ${live.pid}, started ${live.startedAt}, and the row ` +
        'has no start time to compare',
      whyARowWithNoStartTimeIsNotSignalled(report, live),
    )
  }

  const described = liveDescription(live, at)
  if (described === null) {
    return describedOnly(
      `port ${port} (${where}) is held by ${live.command} — pid ${live.pid}, group ${live.pgid}, started ` +
        `"${live.startedAt}", which is not a time`,
      `The start time of pid ${live.pid}, which holds port ${port}, reads "${live.startedAt}", which is not a time.`,
    )
  }
  const describe = `${described}, holding port ${port} (${where})`

  const built = killAction(live, report.pgid, probe, at, signal, `port ${port}`)
  if ('blocked' in built) return describedOnly(describe, built.blocked)
  return { describe, action: built.action, blocked: null, targets: built.targets }
}

function containerView(report: ResourceReport, probe: OsProbe): ResourceView {
  const reading = probe.containers()
  if (!reading.available) {
    return describedOnly(
      `container "${report.key}" — ${report.detail}, and docker could not be reached to read it`,
      `Containers could not be listed, so Mole Office cannot say whether "${report.key}" is running or what stopping it ` +
        `would end: ${reading.reason}`,
    )
  }
  const found = reading.containers.find((c) => c.name === report.key || c.id === report.key)
  if (!found) {
    return describedOnly(
      `container "${report.key}" is not running any more`,
      `No running container is called "${report.key}" now. Release it with no "expect" to tidy the ledger row.`,
    )
  }
  const shortId = found.id.slice(0, 12)
  const describe = `container ${found.name} (${found.image}) — ${found.status}, id ${shortId}`
  return {
    describe,
    action: {
      verb: 'stop',
      target: `container ${found.name}`,
      // No `signal`: docker stop is not a signal Mole Office chooses, and inventing one here would
      // be a field the person could not act on.
      alsoAffects: [],
      confirmPhrase:
        `Stop container ${found.name} (${found.image}, id ${shortId}), ending everything inside it and nothing ` +
        'else on this host.',
    },
    blocked: null,
    targets: [],
  }
}

function lockView(report: ResourceReport, probe: OsProbe): ResourceView {
  const reading = probe.locks([report.key])
  const found = reading.files.find((f) => f.path === report.key)
  const describe =
    found === undefined
      ? `lock file ${report.key} — ${report.detail}`
      : `lock file ${report.key} — ${found.sizeBytes} bytes, last written ${found.modifiedAt}`
  // Always null, per the contract, and for lib/resources.ts's reason: a lock is often the only
  // evidence that a job is still running, and removing it lets a second copy start on the same
  // data, which is worse than the stale lock.
  return describedOnly(
    describe,
    `Mole Office will not delete lock files. A lock is often the only evidence that a job is still running, and ` +
      `removing it lets a second copy start on the same data. Look at it, then remove it yourself: rm ${report.key}`,
  )
}

/**
 * A slot is a seat, never a kill: it is given back at its own door and it ends with its group.
 *
 * It is described by what is holding it, because that is what somebody finding it here needs: a
 * seat held after its session ended is a process group still running with nobody's name on it.
 */
function slotView(report: ResourceReport): ResourceView {
  const held = report.key.includes('#') ? `slot ${report.key}` : `a place in line for ${report.key}`
  const describe =
    report.liveness.state === 'unknown'
      ? `${held} — ${report.detail}; ${report.liveness.reason}`
      : `${held} — ${report.liveness.detail}`
  return describedOnly(
    describe,
    `A slot is a seat, not a process, so there is nothing here to stop. It is given back at POST /api/slots/` +
      `${report.id}/release, and it gives itself back when process group ${String(report.pgid)} ends. Stop that ` +
      'group by its own process row, or by hand if it is yours.',
  )
}

/** Everything the server can honestly say about one live ledger row, right now. */
function viewOf(report: ResourceReport, probe: OsProbe, at: number, signal: KillSignal): ResourceView {
  switch (report.type) {
    case 'process':
    case 'gpu':
    case 'client':
      return processView(report, probe, at, signal)
    case 'port':
      return portView(report, probe, at, signal)
    case 'container':
      return containerView(report, probe)
    case 'lock':
      return lockView(report, probe)
    case 'slot':
      return slotView(report)
  }
}

// ---------------------------------------------------------------------------- the orphan report

/**
 * Where this report looked, in plain English.
 *
 * Named for the same reason `unchecked` exists in the ledger: "no orphans" from a report that
 * looked at three things and "no orphans" from a report that looked at nothing read identically
 * on screen, and only one of them is good news.
 */
function placesSearched(report: OrphanReport): string[] {
  // EVERY LIVE LEDGER ROW, including the ones whose thing is not running any more. This used to
  // be the three lists that were on screen, and when `goneAndNotClosed` arrived those rows left
  // the other lists — so a report of nineteen rows described itself as having looked at none of
  // them. Where the report looked is where it looked, whatever it found.
  const rows = [...report.orphans, ...report.stillOwned, ...report.goneAndNotClosed, ...report.unchecked]
  const keysOf = (...types: ResourceType[]): string[] =>
    rows.filter((r) => types.includes(r.type)).map((r) => r.key)

  const searched = [
    `the “Running on this machine” list — ${rows.length} live ${rows.length === 1 ? 'row' : 'rows'} written down by sessions`,
  ]
  const pids = keysOf('process')
  if (pids.length > 0) searched.push(`the process table on ${report.platform}, for pid ${pids.join(', ')}`)
  const clientPids = keysOf('client')
  if (clientPids.length > 0) searched.push(`the process table on ${report.platform}, for the clients' pid ${clientPids.join(', ')}`)
  const gpuPids = keysOf('gpu')
  if (gpuPids.length > 0) searched.push(`GPU memory (nvidia-smi), for pid ${gpuPids.join(', ')}`)
  const ports = keysOf('port')
  if (ports.length > 0) searched.push(`the listening sockets, for port ${ports.join(', ')}`)
  const containers = keysOf('container')
  if (containers.length > 0) searched.push(`the running containers (docker), for ${containers.join(', ')}`)
  const locks = keysOf('lock')
  if (locks.length > 0) searched.push(`the lock ${locks.length === 1 ? 'file' : 'files'} ${locks.join(', ')}`)
  const slotGroups = rows
    .filter((r) => r.type === 'slot')
    .map((r) => ('pgid' in r && r.pgid !== null ? String(r.pgid) : `none recorded for ${r.key}`))
  if (slotGroups.length > 0) {
    searched.push(`the process table on ${report.platform}, for the process groups holding slots: ${slotGroups.join(', ')}`)
  }
  return searched
}

function orphansResponse(workspaceId: string): OrphansResponse {
  // ONE READING OF EACH LIST OF THE MACHINE for the report, each orphan's view and the sweep (wave 13y round 67). Each
  // view used to read the machine again, so a port orphan read every listening socket again
  // (tests/the-orphans-door-reads-the-machine-once.test.ts).
  const probe = oneReadingPerListing(osProbe())
  const report = orphanReport(workspaceId, probe)
  const at = Date.now()
  const notes: string[] = []

  const orphans: Orphan[] = report.orphans.map((row) => {
    const view = viewOf(row, probe, at, 'SIGTERM')
    // A session the office marked orphaned has not ended, so the release door refuses without force
    // (decision P-0jFzJuFC19). The button does not send force, so none is offered, and the row says why.
    const needsForce = row.session.ended !== true
    if (row.orphanedFor === null) {
      // An orphan's session has ended or was marked orphaned, and the change log says when. If it
      // ever does not, the age is measured from registration instead and SAID so — a
      // silently different unit is how a week-old orphan reads as new.
      notes.push(
        `${row.type} "${row.key}" has no end time for its session, so its age is measured from when it was ` +
          'registered instead of from when its session ended or was marked orphaned.',
      )
    }
    return {
      ...row,
      kind: row.type,
      describe: view.describe,
      ageSeconds: row.orphanedFor?.seconds ?? row.age.seconds,
      sessionId: row.sessionRecordId,
      sessionTitle: row.session.title,
      releaseAction: needsForce ? null : view.action,
      releaseBlockedBecause: needsForce
        ? `The session that started this is marked orphaned, not finished or crashed, so Mole Office does not ` +
          `release it from this list. Mark the session finished or crashed first, or send {"force":true} to ` +
          `POST /api/resources/${row.id}/release, which the change log records as forced.`
        : view.blocked,
    }
  })

  if (report.unchecked.length > 0) {
    notes.push(
      `${report.unchecked.length} ledger ${report.unchecked.length === 1 ? 'row' : 'rows'} could not be checked at ` +
        `all, so this list is not the whole answer: ${report.unchecked.map((u) => `${u.type} "${u.key}" (${u.reason})`).join(' ')}`,
    )
  }
  if (report.goneAndNotClosed.length > 0) {
    const n = report.goneAndNotClosed.length
    notes.push(
      `${n} ledger ${n === 1 ? 'row is' : 'rows are'} still open for something that is NOT running: ` +
        `${report.goneAndNotClosed.map((r) => `${r.type} "${r.key}"`).join(', ')}. Nothing needs killing — what ` +
        'is owed is closing the rows, so the ledger stops saying a session left those behind. They are listed ' +
        'under goneAndNotClosed.',
    )
  }
  const blocked = orphans.filter((o) => o.releaseAction === null).length
  if (blocked > 0) {
    notes.push(
      `${blocked} of ${orphans.length} ${orphans.length === 1 ? 'orphan' : 'orphans'} cannot be released from ` +
        'here, and each one says why on its own row. There is no button for those: the thing they describe is ' +
        'not the thing running now.',
    )
  }

  // ONLY THE FOUR FIELDS THE PAGE READS. The rest of `report` — `checkedAt`, `platform`,
  // `stillOwned`, `goneAndNotClosed` and the top-level `unchecked` — is what made every answer
  // about 76 KB, and the page never looked at any of it (problem aHdrneS3NBGF). The notes built
  // above still read those lists, so the warning keeps saying what they found; only the lists
  // themselves leave the wire.
  return {
    orphans,
    searched: placesSearched(report),
    // Left off entirely when there is nothing to warn about, so a present `warning` always means
    // something. JSON drops an undefined value, which is exactly the wire shape wanted here.
    warning: notes.length === 0 ? undefined : notes.join(' '),
    unclaimed: report.unclaimed,
  }
}

// ---------------------------------------------------------------------------- after a release

/** Which of the processes that were signalled are gone, and which are still there. */
function whatWentAway(
  targets: readonly OsProcess[],
  probe: OsProbe,
): { killed: string[]; survived: string[] } {
  const killed: string[] = []
  const survived: string[] = []
  for (const target of targets) {
    const after = probe.processById(target.pid)
    // A different start time under the same pid means the original is gone and the number has
    // been reused already. That counts as gone, and the stranger is not reported as a survivor.
    if (after === null || after.startedAt !== target.startedAt) killed.push(identityOf(target))
    else survived.push(identityOf(after))
  }
  return { killed, survived }
}

// ---------------------------------------------------------------- which world a registration is of

/**
 * WHICH WORLD THE THING BEING REGISTERED SERVES, IN THE THREE WAYS IT CAN BE KNOWN.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion G5 says a registered process is written down "with its owner session and the world it
 * serves". Until now only a Mole Office API could record one, because it registers itself through
 * `POST /api/runtime/register` and can read its own checkout and database. Every other row got
 * null, and the GROUND verifier measured the result on 3 September 2026: not one row on the
 * canonical ledger carried a world, the owner's own server and browser app included, and the
 * product said so itself in `node tools/listeners.mjs` — "the row does not record which world it
 * serves". Problem `oRrML6lgPNnr`.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE WAYS, IN THE ORDER THEY ARE TRIED
 * ---------------------------------------------------------------------------------------
 *
 * 1. **The caller sent one**, read off the world header of the Mole Office it serves. That is what
 *    the Vite in vite.config.ts does and what `tests/helpers.ts` does for the Vite it starts.
 * 2. **This server asks the port.** A port being registered, or a port the pid being registered is
 *    listening on, is asked `GET /api/runtime` on loopback. A Mole Office answers; anything else
 *    does not, and then there is no world, which is a reading and not a failure.
 * 3. **Neither**, and the row is stored with `world: null`, which means nobody recorded one — never
 *    that there is nothing there. The registration is not refused: the owner's F1 answer is
 *    naming only, and a process refused registration is a process on no list at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS SERVER'S OWN WORLD IS NOT USED FOR
 * ---------------------------------------------------------------------------------------
 *
 * Never as a stand-in. A caller registering a pid on this machine is not necessarily registering
 * something in THIS world — a verifier once registered another session's process as its own — so
 * filling the row in with this server's facts would be a claim dressed as a reading.
 */
async function theWorldOfWhatIsBeingRegistered(body: {
  type: ResourceType
  key?: string | undefined
  container?: string | undefined
  world?: string | undefined
}): Promise<{ world: World | null; how: string }> {
  if (body.world !== undefined) {
    const read = parseWorldHeader(body.world)
    if (!read.ok) {
      // A world that cannot be read is the caller's mistake and is refused as one. This is not the
      // same as sending none: sending none is allowed and says nobody knew.
      throw new PanelError(
        `The world you sent could not be read: ${read.why}. It must be the value of an ` +
          'x-mole-office-world header, copied from a reply of the Mole Office this process serves. ' +
          'Leave it out entirely if you do not have one — the row is then stored saying nobody recorded it.',
      )
    }
    return {
      world: theWorldThatHeaderDescribes(read.world, 'the caller read it off a reply from the Mole Office it serves'),
      how: 'the caller sent it, read off a reply from the Mole Office this process serves',
    }
  }

  // A PROCESS NAMED FROM INSIDE A CONTAINER IS NOT ASKED. Its host pid is found while the row is
  // written, after this, and a sandbox runs no Mole Office of its own in v1, so there is no port of
  // its to ask. The sentence says that, rather than the one below, which claims a port was looked for.
  if (body.container !== undefined) {
    return {
      world: null,
      how:
        'nobody recorded one. Nothing was sent, and this process was named by its pid inside a container, where ' +
        'Mole Office does not look for a port to ask. Send world if the process serves one.',
    }
  }
  const port = portToAsk(body)
  if (port === null) {
    return {
      world: null,
      how:
        'nobody recorded one. Nothing was sent, and this is not something listening on a port that ' +
        'could be asked. The row says so rather than carrying a guess.',
    }
  }
  const asked = await askThePortWhatItIs(port)
  if (asked === null) {
    return {
      world: null,
      how:
        `nobody recorded one. Port ${String(port)} was asked and did not answer as a Mole Office, so there ` +
        'is nothing to record. The row says so rather than carrying a guess.',
    }
  }
  return { world: asked, how: `asked GET /api/runtime on port ${String(port)}` }
}

/** The port to ask: the one being registered, or one the pid being registered is listening on. */
function portToAsk(body: { type: ResourceType; key?: string | undefined }): number | null {
  // No key means the body named a process some other way, which the registration itself refuses or
  // resolves; there is no number here to ask about.
  if (body.key === undefined) return null
  if (body.type === 'port') {
    const port = Number(body.key.trim())
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null
  }
  if (body.type !== 'process') return null
  const pid = Number(body.key.trim())
  if (!Number.isInteger(pid) || pid < 1) return null
  let listening: OsPort[]
  try {
    listening = osProbe().listeningPorts()
  } catch {
    // The machine could not be read. That is a reason there is no world, and the caller is told
    // that in words rather than being handed a world from somewhere else.
    return null
  }
  return listening.find((one) => one.pid === pid)?.port ?? null
}

/**
 * Ask a port on loopback whether it is a Mole Office, and what world it is in.
 *
 * IT READS THE HEADER, NOT THE BODY. Every reply from a Mole Office carries the world header,
 * including a 404 and a refusal, so this works against a server that would not let this caller read
 * `/api/runtime` at all. A reply with no readable header is not a Mole Office as far as this is
 * concerned, and the answer is then that nobody recorded a world.
 *
 * LOOPBACK ONLY, AND A SHORT WAIT. Registering has to be cheap or it gets skipped, and this must
 * never be a way to make the server reach somewhere it was not asked to.
 */
async function askThePortWhatItIs(port: number): Promise<World | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${String(port)}/api/runtime`, {
      signal: AbortSignal.timeout(2000),
    })
    const read = parseWorldHeader(res.headers.get(WORLD_HEADER))
    if (!read.ok) return null
    return theWorldThatHeaderDescribes(read.world, `asked the Mole Office answering on port ${String(port)}`)
  } catch {
    // Nothing answered, or it answered something that is not a Mole Office. Both mean there is no
    // world to record, which the caller is told in words by `theWorldOfWhatIsBeingRegistered`.
    return null
  }
}

// ============================================================================ routes

export async function resourceRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Write down something this session started. 201 with the ledger row.
   *
   * A process or GPU pid is probed as this is answered, so a pid that is not running is a 400
   * and never becomes an orphan that was never true.
   *
   * The owning session comes from `sessionRecordId` when the body carries one and from the
   * `x-mole-office-session` header when it does not, so the ordinary registration is three fields:
   * {"type":"process","key":"<pid>"} plus the header the caller is already sending.
   *
   * A process inside a container sends {"type":"process","container":"<name or id>","pidInContainer":<n>}
   * instead of a key, and the row is written about the same process as this machine numbers it.
   *
   * A BARE PID FROM A PROGRAM IN A CONTAINER is read in that program's own pid namespace (problem
   * xnfjNO3w2GCQ): an agent in a sandbox sends the pid it sees, as wave 13j's supervisor did, and the row
   * still holds this machine's numbers. AND A CONTAINER SUCH A PROGRAM NAMES MUST BE ITS OWN (problem
   * ytWensT7blOP). Which program sent it is asked of the operating system, from the connection, and never
   * of the request.
   */
  app.post('/resources', route('runtime.claim', 'local', {
    because: 'acts-on-this-machine',
    act: 'Writing down something running on this computer',
  }), async (req, reply): Promise<{ resource: LedgerEntry; world: World | null; howTheWorldWasGot: string }> => {
    const actor = actorFrom(req)
    // The body first, then the owner — but the body's refusal has to MENTION the owner, because
    // the skill's reference tells an agent to post an empty body and read the field list out of
    // the one refusal that comes back. It listed `type` and `key` and said nothing about who owns
    // the row, so an agent that had not filed its session yet paid two round trips and two
    // different failure shapes for what is documented as one. `ownerProblem` asks the same
    // question `ownerSessionRecord` does, without throwing, so both halves can be said at once.
    const workspaceId = workspaceOf(req)
    const body = parseRegisterBody(req.body, ownerProblem(req.body, actor, workspaceId))
    const placed = await whatTheDoorMakesOfTheCaller(req, actor, body)
    const got = await theWorldOfWhatIsBeingRegistered(body)
    const input: RegisterInput = {
      workspaceId,
      sessionRecordId: ownerSessionRecord(body.sessionRecordId, actor, workspaceId),
      type: body.type,
      ...(body.key === undefined ? {} : { key: body.key }),
      ...(body.container === undefined ? {} : { container: body.container }),
      ...(body.pidInContainer === undefined ? {} : { pidInContainer: body.pidInContainer }),
      ...placed,
      detail: body.detail,
      ...(got.world === null ? {} : { world: got.world }),
      ...(body.startedByTheProduct === undefined ? {} : { startedByTheProduct: body.startedByTheProduct }),
      ...(body.osStartedAt === undefined ? {} : { osStartedAt: body.osStartedAt }),
      ...(body.adopting === undefined ? {} : { adopting: body.adopting }),
      sentThroughTheDoor: true,
      actor,
    }
    const resource = await readFirst(() => theProcessesARegistrationReads(input), () => registerResource(input))
    reply.status(201)
    return {
      resource,
      // Both are on the reply because a caller that sent no world has to be able to see whether one
      // was worked out, and a caller that sent one has to be able to see that it was read. A row
      // with no world is a real answer and this is where it is said.
      world: got.world,
      howTheWorldWasGot: got.how,
    }
  })

  /**
   * The ledger. Live rows by default; add ?includeReleased=true for the history.
   *
   * A LIVE ROW IS CHECKED AGAINST THIS MACHINE AS THIS IS ANSWERED; A RELEASED ROW IS NOT. A
   * released row is closed — what it says about who let it go and when is stored on the row — so
   * its `liveness` and its `session` say that nothing was looked at rather than what was found.
   * Checking them cost 20 to 26 seconds of the office's one thread per read on the owner's own
   * office (finding 67), and everything else waited behind it.
   */
  app.get('/resources', route('runtime.resources', 'remote'), async (req) => {
    const q = parse(ledgerQuery, req.query, 'The query string is not usable:')
    const listing = { workspaceId: workspaceOf(req), sessionRecordId: q.sessionRecordId, includeReleased: q.includeReleased, pgid: q.pgid }
    return { resources: await readFirst(() => theProcessesAListingReads(listing), () => listResources(listing)) }
  })

  /**
   * What is alive whose owning session has ended, and exactly what releasing each one would do.
   *
   * Every orphan carries `describe` and either a `releaseAction` naming the group, the signal
   * and every process that would go with it, or a null action with the reason. Nothing here
   * changes anything; the buttons this feeds are the only thing that can, and only with the
   * sentence below sent back.
   *
   * THE ANSWER CARRIES ONLY WHAT THE RUNNING COLUMN READS — `orphans`, `searched`, `unclaimed` and,
   * when there is something to say, `warning` — and nothing else. `orphanReport` in lib/resources.ts
   * still builds the whole report: `warning` names the rows that could not be checked
   * (`unchecked`), the rows still open for something that is not running (`goneAndNotClosed`), and
   * the orphans with no release action. `searched` says where it looked, because reading an empty
   * list as "all clear" is the exact mistake this endpoint exists to prevent.
   */
  app.get('/resources/orphans', route('runtime.orphans', 'remote'), async (req): Promise<OrphansResponse> => {
    // The processes of every row the report checks are read first, by the way that waits (claim 8 of
    // tests/no-windows-process-reading-holds-the-servers-thread.test.ts). The sweep of the GPU asks about processes no
    // row names, so one reading of every process answers those (claim 8c). The sweep reads the GPU's list and the
    // running containers, so those are read first too (claim 8).
    const workspaceId = workspaceOf(req)
    return readFirst(() => theProcessesAListingReads({ workspaceId }), () => orphansResponse(workspaceId), {
      andEveryOtherProcess: true,
      andTheMachinesLists: true,
    })
  })

  /**
   * The machine as it is, whether or not anything was registered.
   *
   * The incidents this feature was built after were caused by sessions that died before they
   * wrote anything down, so the ledger alone would not have caught them. This is the view that
   * does: every listening port with the process group holding it, the GPU, the containers, and
   * the lock files under the configured paths.
   */
  app.get('/resources/scan', route('runtime.resources', 'remote'), async (): Promise<OsScan> => {
    return scanMachine()
  })

  /**
   * Every Mole Office dev-stack process running on this machine, and who owns each one.
   *
   * This is the read for "which server am I talking to, which corpus is it serving, and is
   * anything else running that will confuse the answer". It answers the first two from what this
   * process knows about itself, which is certain, and the rest from the machine.
   *
   * It distinguishes a live process from a claim somebody wrote down. A ledger row that has
   * stopped describing what is running is reported as a claim, named as such, and never counted
   * as evidence that a thing is alive.
   *
   * IT CHANGES NOTHING. There is no verb on this route and no route that acts on what it finds.
   * Where a person could end something, the command is printed with every process it would end
   * named first; Mole Office does not run it, does not offer to, and does not mark any session
   * finished to tidy a row.
   *
   * `couldNotLook` is the field to read before believing the rest: a report that could not read
   * the process table says so there and its summary refuses to describe the machine as clear.
   */
  app.get('/resources/servers', route('runtime.resources', 'remote'), async (req): Promise<ServerReport> => {
    return serversOnThisMachine(workspaceOf(req))
  })

  /**
   * DOES A LIVE WORLD HOLD THIS PORT OR THIS DATABASE FILE? The ledger check of a decision,
   * asked by a cleanup before it removes a database or frees a port. It reads
   * every project's open rows and asks the machine about each one it finds. It signals nothing and
   * closes no row. `whatHoldsIt` in lib/resources.ts says what counts as holding.
   */
  app.get('/resources/holding', route('runtime.resources', 'remote'), async (req): Promise<WhatHoldsIt> => {
    const q = parse(holdingQuery, req.query, 'The query string is not usable:')
    return whatHoldsIt({ ports: q.ports ?? [], database: q.database ?? null })
  })

  // An explicit sweep closes stale process rows; it never stops a process. ssE_OrIgHoye.
  app.post('/resources/sweep', route('runtime.claim', 'local', {
    because: 'acts-on-this-machine',
    act: 'Closing ended runs’ rows after checking their processes on this computer',
  }), async (req): Promise<EndedRunRows> => {
    return sweepTheGoneProcessRowsOfEndedRuns(workspaceOf(req), actorFrom(req))
  })

  /**
   * Kill one resource, by process GROUP, and record who asked and what they confirmed.
   *
   * The machine is read again HERE, and the sentence rebuilt from that reading. Send back the
   * confirmPhrase you were shown as {"expect": "..."}:
   *
   *   409  it moved between the read and now — pid recycled, port changed hands, group changed,
   *        session came back to life. Nothing is signalled and the answer says which.
   *   400  the sentence does not match the one this release would act on now. The current
   *        sentence comes back in the message, so the next call is a re-read and a re-confirm.
   *
   * A resource that can be described but arrives with no "expect" is also a 400: Mole Office will not
   * kill blind something it could have named. A resource it cannot describe — already gone, a
   * lock, a group it cannot enumerate — falls through to lib/resources.ts, which either tidies
   * the ledger row or refuses with its own sentence.
   */
  app.post('/resources/:id/release', route('runtime.claim', 'local', {
    because: 'acts-on-this-machine',
    act: 'Stopping something running on this computer',
  }), async (req): Promise<ReleaseResponse> => {
    const actor = actorFrom(req)
    const workspaceId = workspaceOf(req)
    const { id } = parse(idParams, req.params, 'The URL is not usable:')
    const body = parse(releaseBody, req.body, 'The request body is not usable:')
    /**
     * A CLOSE WITH NO SIGNAL HAS NO SENTENCE TO CONFIRM. The confirm phrase describes what a signal
     * would end, and this sends none, so the checks below are about a different act. The row is
     * closed only if the caller is the session that registered it; lib/resources.ts decides that.
     */
    const signalNothing = body?.signalNothing === true
    if (signalNothing) {
      const clash = (['expect', 'signal', 'force'] as const).filter((key) => body?.[key] !== undefined)
      if (clash.length > 0) {
        throw new PanelError(
          `"signalNothing" closes the row and sends no signal, so it cannot be sent with ${clash
            .map((key) => `"${key}"`)
            .join(' or ')}, which are about a signal. Nothing was done.`,
        )
      }
    }
    const probe = osProbe()
    // The phrase is built for the signal that will actually be sent, so escalating to SIGKILL
    // needs its own confirmation rather than riding in on the SIGTERM one somebody read.
    const signal: KillSignal = body?.signal ?? 'SIGTERM'
    const expected = body?.expect

    // The reading this decision is made on is taken NOW. Not the one in the caller's hand, not
    // the one the report was built from. Everything else in this handler compares against it.
    const live = listResources({ workspaceId, id }).find((r) => r.id === id) ?? null
    const view = live === null ? null : viewOf(live, probe, Date.now(), signal)

    // A session that is still running is lib/resources.ts's refusal to make, and it makes it
    // well: it names the session, how to mark it finished, and how to force it. Asking for a
    // confirm phrase first would answer a question the caller has not got to yet — and a
    // session that came BACK to life between the read and now is exactly that refusal, which
    // is why it is checked before the phrase rather than after it.
    const sessionStillRunning = live !== null && live.session.ended !== true && body?.force !== true

    if (view !== null && !sessionStillRunning && !signalNothing) {
      if (expected !== undefined && view.action === null && live?.type !== 'lock') {
        throw new PanelError(
          `Mole Office did not act, because the machine no longer reads the way it did when you were shown that ` +
            `sentence. ${view.blocked ?? ''} What is there now: ${view.describe}`,
          409,
        )
      }
      if (expected !== undefined && view.action !== null && view.action.confirmPhrase !== expected) {
        throw new PanelError(
          'Mole Office did not act. The sentence sent back is not the one this release would act on now, so the ' +
            'reading it came from is out of date — that is how the wrong thing gets killed. Read it again and ' +
            `confirm this one instead: "${view.action.confirmPhrase}"`,
          400,
        )
      }
      if (expected === undefined && view.action !== null) {
        throw new PanelError(
          'Mole Office can say exactly what this would end, so it will not do it without that being confirmed. Send ' +
            `the sentence back as {"expect": "..."}: "${view.action.confirmPhrase}"`,
          400,
        )
      }
    }

    // The signal goes out from here. Everything above decided whether it may.
    const note = [body?.note, expected === undefined ? undefined : `confirmed: ${expected}`]
      .filter((s): s is string => s !== undefined && s.trim() !== '')
      .join('; ')
    const result = await releaseResource(
      id,
      {
        signal: body?.signal,
        force: body?.force,
        ...(signalNothing ? { signalNothing: true } : {}),
        note: note === '' ? undefined : note,
        actor,
      },
      workspaceId,
    )

    const description = view?.describe ?? result.resource.detail
    // A group kill is checked process by process against the reading taken before it. Assuming
    // the children died because the leader did is the assumption this whole feature exists to
    // stop being made.
    const outcome =
      view !== null && view.targets.length > 0
        ? whatWentAway(view.targets, probe)
        : {
            killed: result.acted && !result.stillAlive ? [description] : [],
            survived: result.acted && result.stillAlive ? [description] : [],
          }

    return {
      ...result,
      released: true,
      description,
      killed: outcome.killed,
      survived: outcome.survived,
      confirmed: expected ?? null,
    }
  })

  /**
   * TAKE BACK A ROW THIS SESSION SHOULD NEVER HAVE WRITTEN. It signals nothing.
   *
   * It is `local` and `runtime.claim`, the same pair the registration above uses, because it is the
   * same kind of act: a write to the list of what is running on this computer. `runtime.resources`
   * would be wrong — that operation is declared as a read, and this changes a row.
   */
  app.post('/resources/:id/withdraw', route('runtime.claim', 'local', {
    because: 'acts-on-this-machine',
    act: 'Taking back something written down about this computer',
  }), async (req): Promise<WithdrawResponse> => {
    const actor = actorFrom(req)
    const workspaceId = workspaceOf(req)
    const { id } = parse(idParams, req.params, 'The URL is not usable:')
    const body = parse(withdrawBody, req.body, 'The request body is not usable:')
    const done = withdrawRowRegisteredByMistake(id, workspaceId, body.because, actor)
    return { ...done, withdrawn: true }
  })
}
