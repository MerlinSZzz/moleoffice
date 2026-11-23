// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT IS RUNNING, ANSWERED BY THE THING THAT IS RUNNING.
 *
 *   GET  /api/runtime            what this server is: pid, port, checkout, database, owner, freshness
 *   GET  /api/runtime/freshness  is the code this server is serving as new as the checkout
 *   GET  /api/runtime/listeners  every Mole Office-looking listener on this machine, named, never stopped
 *   POST /api/runtime/register   this server writes itself into the resources ledger
 *   POST /api/runtime/stop       stop a process the product started, whose owner session has ended
 *
 * Criteria G2 and G5 of design/ground/ACCEPTANCE.md, out of the owner's problem 21. The state to prevent: a real
 * API and a scratch API side by side, a browser still pointing at the scratch database, and health checks that
 * appear green. Nothing could be asked any of it.
 *
 * THE FIRST THREE READ. They signal nothing and start nothing: asking a server what it is has to be
 * safe on somebody else's stack, and the owner's F1 answer of 3 September 2026 is that Mole Office
 * names what it did not start and never stops it. `POST /api/runtime/stop` is the one door that
 * signals, and it is narrow on purpose — see its own note.
 */

import type { FastifyInstance } from 'fastify'
import type { RuntimeRecord, World } from '@shared/runtime.ts'
import type { PanelRecord } from '@shared/types.ts'
import { route } from '../lib/route.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { getRecord, mayEndARun, patchRecord, recordInWorkspace, type Actor } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { revokeTheRunKeyRecordedOn } from '../lib/keys.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { tellTheStarterACheckWasStopped } from '../lib/a-stopped-check.ts'
import { theAgentTheKeyProves } from '../lib/the-agent-the-key-proves.ts'
import { theKeyProvesASecretary } from '../lib/the-key-proves-a-secretary.ts'
import { theToolsOwnProcessRow } from '../lib/merge-queue.ts'
import { runtimeRecord, theProcessesTheRuntimeRecordReads, worldNow } from '../lib/runtime.ts'
import { registerThisServer, tellTheOfficeWhatThisWorldIsFor } from '../lib/register-this-server.ts'
import {
  listenersOnThisMachine,
  rowForStop,
  stoppingThisInterruptsItsOwnSession,
  type ListenerReport,
} from '../lib/listeners.ts'
import { sayARunWasStopped } from '../lib/worker.ts'
import { theRunsOwnAgents } from '../lib/the-run-a-key-holds.ts'
import { type LedgerEntry, readFirst, releaseResource } from '../lib/resources.ts'
import { z } from 'zod'

/** What a caller sends to have this server register itself. */
const registerSelf = z
  .object({
    /**
     * The session that started this server. Left out, the `x-mole-office-session` header is used —
     * which is what a test helper and an agent both already send.
     */
    sessionRecordId: z.string().min(1).optional(),
    /** One line about what this server is for. */
    detail: z.string().max(500).optional(),
    /**
     * Whether Mole Office itself started this process. Only something that really did start it may
     * say so, and saying so is what makes it stoppable later. Absent means nobody recorded it.
     */
    startedByTheProduct: z.boolean().optional(),
  })
  .strict()

/** What a person sends to stop something the product started. */
const stopPress = z
  .object({
    /** The ledger row, which is the only thing that can be stopped. Not a pid. */
    resourceId: z.string().min(1),
    /** Why. Kept on the row, because "who stopped it and why" is the question this answers later. */
    why: z.string().min(1).max(500),
  })
  .strict()

/** What a caller sends to stop a run through its door. */
const stopARunPress = z
  .object({
    /** Why. Written on the run with who stopped it, and on the key the stop revoked. */
    why: z.string().trim().min(1).max(500),
  })
  .strict()

/** What the refusal says to the run's own agent. Exported so a test reads the words rather than copying them. */
export const THE_KEY_PROVES_THE_RUNS_OWN_AGENT = "The agent this key proves is the run's own agent."

/**
 * WHY THIS CALLER MAY NOT STOP THIS RUN, or null when it may.
 *
 * Only a key proves who is asking, so a name in the headers, a key acting for another agent and the office's key are
 * all refused here. A secretary is admitted. Anyone else must be one the office lets end the run (`mayEndARun`): the
 * agent that started the run's agent, which for a worker is its supervisor, or the agent that filed the run. The
 * run's own agent, the agent it serves or an agent it ran as, is not admitted, because it is the run being stopped.
 */
export function whyThisCallerMayNotStopTheRun(actor: Actor, run: PanelRecord, action = 'stop it', personSentence = "The person stops a run's process from its row in the ledger."): string | null {
  const who = `Only the agent that started run ${run.id}, its supervisor or a secretary may ${action} through this door, each proved by its own key.`
  const caller = actor.type === 'agent' && actor.provedHolder === undefined ? theAgentTheKeyProves(actor) : null
  if (caller === null) {
    return `${who} This request was not proved by an agent's own key.${personSentence === '' ? '' : ` ${personSentence}`}`
  }
  if (theKeyProvesASecretary(actor)) return null
  if (theRunsOwnAgents(run.data).includes(caller)) return `${who} ${THE_KEY_PROVES_THE_RUNS_OWN_AGENT}`
  if (mayEndARun(actor, { recordId: run.id, workspaceId: run.workspaceId, data: run.data })) return null
  return `${who} The agent this key proves is none of them.`
}

export async function runtimeRoutes(app: FastifyInstance): Promise<void> {
  /**
   * What this server is, read at the moment of the request and nothing cached.
   *
   * Everything a person or an agent needs to tell a real Mole Office from a scratch one: the
   * process and its group, the port it was told to take and the ports it actually holds, the
   * checkout and its commit and whether the tree is dirty, the database file it has open and
   * whether that is the canonical one, who registered it and when, whether it is scratch or
   * canonical WITH the reasons, and whether the code it loaded is as new as the checkout.
   *
   * `couldNotRead` carries anything it could not answer, with the reason. An empty list means
   * everything was read.
   */
  app.get('/runtime', route('runtime.resources', 'remote'), async (): Promise<RuntimeRecord> => {
    // THE PROCESSES IT READS ARE READ FIRST, without holding the thread (Windows; `readFirst` in lib/resources.ts).
    return await readFirst(theProcessesTheRuntimeRecordReads, runtimeRecord)
  })

  /**
   * Is the code this server is serving as new as the checkout on disk.
   *
   * The same freshness the record above carries, on its own, because the instruments ask this
   * before they measure and a whole runtime record is more than they need. `tools/zoom-sweep.mjs`,
   * `tools/dup-keys.mjs`, `tools/press-census.mjs` and `tools/review.mjs` all refuse to measure a
   * stale world, and this is what they ask.
   */
  app.get('/runtime/freshness', route('runtime.resources', 'remote'), async () => {
    const record = await readFirst(theProcessesTheRuntimeRecordReads, runtimeRecord)
    return {
      freshness: record.freshness,
      // The instruments print these when they refuse, so that the refusal names the world it is
      // refusing rather than only saying no.
      world: worldNow(),
      startedAt: record.process.startedAt,
      couldNotRead: record.couldNotRead,
    }
  })

  /**
   * Every listener on this machine that looks like a Mole Office, named and never stopped.
   *
   * "Looks like" is three things, and the reply says which one caught each row: a port this
   * checkout's settings declare, a port some live ledger row names, or a process on loopback whose
   * command line is this repository's server or its Vite. Anything caught by any of them is listed
   * with its world if a row carries one, or as UNOWNED if no live row does.
   *
   * IT NAMES. It never signals. See the file header for the owner's F1 answer.
   */
  app.get('/runtime/listeners', route('runtime.resources', 'remote'), async (req): Promise<ListenerReport> => {
    return listenersOnThisMachine(workspaceOf(req))
  })

  /**
   * This server writes itself into the resources ledger: one row for the process, one for the port.
   *
   * WHY THE SERVER AND NOT THE CALLER. Only this process can honestly say which checkout its code
   * came from, which database file it holds open and which commit it was built at. A caller
   * registering it from outside would be describing a world it has not read — and that is exactly
   * how a verifier once registered another session's process as its own. So the caller says WHO
   * owns it and this server says WHAT it is.
   *
   * `tests/helpers.ts` calls this for every server `liveApp` starts, which is what criterion G5
   * means by a test registering its servers through the same route.
   */
  app.post('/runtime/register', route('runtime.claim', 'local', {
    because: 'acts-on-this-machine',
    act: 'Writing this server into the ledger of processes on this computer',
  }), async (req, reply): Promise<{ world: World; resources: LedgerEntry[]; named: { told: boolean; why: string } }> => {
    const actor = actorFrom(req)
    const body = parse(registerSelf, req.body ?? {}, 'The registration is not usable:')
    const sessionRecordId = body.sessionRecordId ?? actor.sessionId ?? ''
    if (sessionRecordId === '') {
      throw new PanelError(
        'Say which session started this server: either sessionRecordId in the body, or the ' +
          'x-mole-office-session header. A resource is owned by the session that started it, because ' +
          '"has the owner ended" is the whole question the ledger answers.',
      )
    }
    const workspaceId = workspaceOf(req)
    /**
     * THE WRITING ITSELF IS `registerThisServer` IN lib/register-this-server.ts, and this route is
     * one of its two callers. The other is the server's own start, in src/server/index.ts. Two
     * spellings of what a server writes down about itself would be free to disagree; that file's
     * header says what it does and why each part of it is there.
     */
    const written = registerThisServer({
      workspaceId,
      sessionRecordId,
      ...(body.detail === undefined ? {} : { detail: body.detail }),
      ...(body.startedByTheProduct === undefined ? {} : { startedByTheProduct: body.startedByTheProduct }),
      actor,
    })
    /**
     * AND THE OFFICE IS TOLD WHAT THIS WORLD IS FOR, when this registration said. The world's own
     * row is not a list anybody reads: a world that is not the office answers from the mirror.
     * Problem `0wPbeU5pdYW5`. It is awaited so the reply can say what happened, and it never fails
     * the registration.
     */
    const atTheOffice = written.atTheOffice
    const named =
      atTheOffice === null || body.detail === undefined
        ? { told: false, why: 'this registration said nothing about what the world is for' }
        : await tellTheOfficeWhatThisWorldIsFor(atTheOffice, actor)
    reply.status(201)
    return { world: written.world, resources: written.resources, named }
  })

  /**
   * Stop something Mole Office started, whose owner session has ended, because somebody pressed.
   *
   * FOUR THINGS HAVE TO BE TRUE and the refusal says which one was not:
   *
   * 1. The row exists and is live.
   * 2. The row says Mole Office itself started the process. Null means nobody recorded it, and that
   *    is not permission — it is the weakest evidence there is.
   * 3. The owning session has ended. A running session's server is its own business.
   * 4. Somebody pressed, and said why. There is no timer in this product that reaches a process.
   *
   * The signal itself, the group, and everything the group would end are `releaseResource`'s, which
   * has done this since round seven; this door decides only whether it may be opened.
   */
  app.post('/runtime/stop', route('runtime.claim', 'local', {
    because: 'acts-on-this-machine',
    act: 'Stopping a process on this computer',
  }), async (req) => {
    const actor = actorFrom(req)
    const body = parse(stopPress, req.body, 'The press is not usable:')
    const workspaceId = workspaceOf(req)
    // The three checks that are not "somebody pressed", with the refusal naming which one failed.
    const found = rowForStop(body.resourceId, workspaceId)
    /**
     * A RUN MOLE OFFICE STARTED IS STOPPED WHILE IT IS STILL RUNNING, AND THAT IS THE POINT.
     *
     * `releaseResource` refuses to signal a process whose session has not ended unless the caller
     * says `force`, and it writes that word into the change log. For a run the product started the
     * session IS the process — `rowForStop` has already checked both halves of that — so the force
     * is honest and the note beside it says which case this was.
     */
    const interrupts = stoppingThisInterruptsItsOwnSession(found)
    const result = await releaseResource(
      found.entry.id,
      {
        actor,
        note: interrupts
          ? `stopped by a press while it was still running, because Mole Office started it: ${body.why}`
          : `stopped by a press: ${body.why}`,
        ...(interrupts ? { force: true } : {}),
      },
      workspaceId,
    )
    // AND THE MESSAGE THAT RUN WAS DELIVERING SAYS WHO STOPPED IT AND WHY, so a person looking at a
    // conversation is never left with a message that stopped moving for no stated reason.
    const said = sayARunWasStopped(found.entry.sessionRecordId, actor, body.why, workspaceId)
    return {
      stopped: result.acted,
      outcome: result.outcome,
      stillAlive: result.stillAlive,
      resource: result.resource,
      message: said,
    }
  })

  /**
   * A RUN THAT WILL NOT STOP, stopped by the agent that started it, its supervisor or a secretary. Wave 13s, round
   * 62, item 3.
   *
   * ONE CALL DOES THREE THINGS, in this order, and the reply says what each did:
   *
   * 1. The run's key is revoked, so the run's writes to the office stop at once, even while its process lives.
   * 2. The process group the ledger recorded for the run is stopped through `releaseResource`, on the row
   *    `theToolsOwnProcessRow` reads: the row the launcher marked as the run's own, which the shutdown pause stops
   *    the same way. Never a process found by its name or by a port.
   * 3. The run's `doing` says who stopped it and why, but only when this call signalled its group. Of a group it
   *    signalled, the run is written `crashed` only when that group is gone after the signal, as a stop from the
   *    product writes it (`sayARunWasStopped`): a run whose process still runs has not ended. A group that had ended
   *    before the stop is the case below.
   *
   * A caller the rule does not admit is refused before anything is done (`whyThisCallerMayNotStopTheRun`).
   *
   * WHEN THIS CALL SIGNALLED NOTHING, the reply is a refusal that says what was found: a 409 when no group is recorded,
   * its row was closed already, or its group had ended already (its row is then closed, with no signal), a 503 when
   * nothing was ended and its program may still run, and the release's own status when the release refused. On
   * Windows the group is the Job Object the run's starter made, which the release ends at once. The key is revoked
   * all the same, because the key is what stops the run's writes, whether or not there is a group to signal. The run is never told it was stopped by this call
   * (invariant 1). When the call revoked the key, the run's `doing` says that and what was found, and keeps what it
   * said before after it. When its group had ended already, the run is written `crashed` as well, unless its state
   * says it has ended, by the rule `stoppedIt` uses: nothing of it runs, and with its key revoked nothing can write
   * for it. The answer is still a 409, because this call signalled nothing. With no group recorded, a closed row, a
   * release that refused or a 503, nobody knows its program has ended, so its state is left as it was. When the call
   * revoked no key either, nothing is written on the run: its `doing` and its state are as they were.
   */
  app.post('/runtime/runs/:id/stop', route('runtime.claim', 'local', {
    because: 'acts-on-this-machine',
    act: 'Stopping a run on this computer',
  }), async (req) => {
    const actor = actorFrom(req)
    const { id } = req.params as { id: string }
    const body = parse(stopARunPress, req.body, 'The stop is not usable:')
    const workspaceId = workspaceOf(req)
    const filed = getRecord(id)
    if (filed === null || filed.kind !== 'session' || filed.deletedAt !== null) {
      throw new PanelError(`No run ${id} in this project. Nothing was done.`, 404)
    }
    // A RUN FILED IN ANOTHER PROJECT is refused with 404 by the reader every by-id door uses, which names its project.
    const run = recordInWorkspace(id, workspaceId)
    const refusal = whyThisCallerMayNotStopTheRun(actor, run)
    if (refusal !== null) throw new PanelError(`${refusal} Nothing was done.`, 403)

    const why = body.why.replace(/[.\s]+$/, '')
    const keyRevoked = revokeTheRunKeyRecordedOn(run.data as Record<string, unknown>, `The agent ${actor.id} revoked run ${run.id}'s key through its stop door: ${why}.`) !== null
    const theKey = keyRevoked
      ? 'Its key was revoked, so its writes to the office stop now.'
      : 'This stop revoked no key: the run was minted none, or its key was revoked already.'
    /** This call signalled the run's group, so the run says who stopped it, and is crashed when its group is gone. */
    const stoppedIt = (what: string, ended: boolean): string => {
      const doing = `The agent ${actor.id} stopped this run: ${why}. ${theKey} ${what}`
      const crashed = ended && !theRunHasEnded(run.data['state'])
      patchRecord(run.id, { dataPatch: { doing, ...(crashed ? { state: 'crashed' } : {}) } }, actor)
      // A CHECK THAT WAS STOPPED WRITES NOTHING MORE, so the office tells the checked run's starter.
      tellTheStarterACheckWasStopped(run, actor, why, workspaceId)
      return doing
    }
    /**
     * This call signalled nothing. The refusal it is answered, after the key is written on the run if it was revoked.
     * `ended` is true only when the release found the run's group ended already. Then, when this call revoked the key,
     * the run is written crashed as well, by the rule `stoppedIt` uses. Every other caller passes false, because there
     * nobody knows the run's program has ended, so its state is left as it was.
     */
    const signalledNothing = (found: string, status: number, ended: boolean): PanelError => {
      if (!keyRevoked) {
        return new PanelError(`${found} ${theKey} Nothing was written on the run: its doing line and its state are as they were.`, status)
      }
      const crashed = ended && !theRunHasEnded(run.data['state'])
      const earlier = run.data['doing']
      const before = typeof earlier === 'string' && earlier.trim() !== ''
        ? `Before this, the run said: ${earlier}`
        : 'Before this, its doing line was empty.'
      const doing = `The agent ${actor.id} revoked this run's key through its stop door: ${why}. Its writes to the office stop now. ${found} ${before}`
      patchRecord(run.id, { dataPatch: { doing, ...(crashed ? { state: 'crashed' } : {}) } }, actor)
      tellTheStarterACheckWasStopped(run, actor, why, workspaceId)
      return new PanelError(
        crashed
          ? `${found} The run's key was revoked all the same, and its state is now crashed, because its program had ended before this stop. The run now says: ${doing}`
          : `${found} The run's key was revoked all the same, and its state was left as it was. The run now says: ${doing}`,
        status,
      )
    }

    const own = theToolsOwnProcessRow(workspaceId, run.id)
    if (own === undefined || own.releasedAt !== null) {
      throw signalledNothing(
        own === undefined
          ? `Mole Office has no process group recorded for run ${run.id}, so nothing was signalled.`
          : `Mole Office has no process group recorded as running for run ${run.id}: its process row ${own.id} was closed at ${own.releasedAt ?? ''}, so nothing was signalled.`,
        409,
        false,
      )
    }
    let result: Awaited<ReturnType<typeof releaseResource>>
    try {
      result = await releaseResource(own.id, { actor, force: true, note: `stopped through its run's stop door: ${why}` }, workspaceId)
    } catch (error) {
      if (!(error instanceof PanelError)) throw error
      throw signalledNothing(`Its process group ${String(own.pgid)} was not signalled: ${error.message}`, error.status, false)
    }
    // ON WINDOWS A RUN'S ROW RECORDS GROUP 0, as the reader gives every process, and the release ends the Job Object
    // its starter made (`endTheJobObject` in lib/resources.ts). There the release's own sentence says what it did.
    const itsGroup = own.pgid !== null && own.pgid > 1 ? `its process group ${String(own.pgid)}` : null
    // A GROUP THAT HAD ENDED ALREADY had its row closed with no signal (`releaseResource`), so this call stopped nothing.
    // A release that ended nothing while its program may still run says why, and never that it ended.
    if (!result.acted) {
      throw result.stillAlive === false
        ? signalledNothing(`Mole Office found ${itsGroup ?? 'its program'} ended already. ${result.outcome}`, 409, true)
        : signalledNothing(`Mole Office stopped nothing of run ${run.id}. ${result.outcome}`, 503, false)
    }
    const doing = stoppedIt(
      itsGroup !== null && result.stillAlive === true
        ? `Its process group ${String(own.pgid)} was sent SIGTERM and is still running.`
        : itsGroup !== null && result.stillAlive === false
          ? `Its process group ${String(own.pgid)} has ended.`
          : result.outcome,
      result.stillAlive === false,
    )
    return {
      run: run.id,
      keyRevoked,
      stopped: result.acted,
      stillAlive: result.stillAlive,
      outcome: result.outcome,
      resource: result.resource,
      recorded: doing,
    }
  })
}
