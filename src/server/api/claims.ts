// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WORK CLAIMS OVER HTTP.
 *
 *   GET  /api/claims                every claim in this project, and every overlap between two of them
 *   GET  /api/claims/on/:recordId   the live claims naming one record, and any conflict over it
 *   POST /api/claims                say what you are working on
 *   POST /api/claims/:id/renew      say the run is still working on it
 *   POST /api/claims/:id/release    say you have finished with it
 *
 * FILING A CLAIM MAY OPEN A GROUP, AND NOBODY IS ASKED. A conflict opens a group, and the person is put
 * in it. The reply says which groups were opened, so the agent that filed the claim learns about the
 * conflict from the answer to its own request rather than by finding a message later.
 *
 * THE RULES ARE IN src/server/lib/claims.ts, beside the refusals that name them.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { CLAIMED_KINDS, type ClaimedThing } from '@shared/claims.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theMessageReader } from '../lib/messages.ts'
import { route } from '../lib/route.ts'
import { getRecord, recordInWorkspace, type Actor } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { packageOf, responsibleFor, type Responsibility } from '../lib/delegation.ts'
import { handleOf, writeASystemLineToOne } from '../lib/groups.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import {
  claimsIn,
  fileAClaim,
  liveClaimsIn,
  liveClaimsOnRecord,
  overlapsIn,
  overlapsOnRecord,
  releaseAClaim,
  renewAClaim,
  theClaimOrARefusal,
} from '../lib/claims.ts'
import { type ParticipantRef } from '@shared/participants.ts'

// ============================================================================ the sentences

const LIST_NOTE =
  'EVERY WORK CLAIM IN THIS PROJECT, newest first, with `live` naming the ones whose run is still going. A claim ' +
  'says who is working, which run is doing it, and which records and files it is about. `overlaps` names every ' +
  'pair of live claims from different participants that name the same thing, with the group opened for each. A ' +
  'lease has no expiry: it ends when its run ends, and each claim says which input answered — a registered ' +
  'process on the ledger, or the session record’s own state word, which is the weaker of the two.'

const ON_RECORD_NOTE =
  'WHO IS WORKING ON ONE RECORD RIGHT NOW, and whether two of them are working on it at once. This is what the ' +
  'record page draws. An empty list means nobody has said they are working on it, which is not the same as ' +
  'nobody working on it: a claim is something an agent files, and one that files none appears here as nothing.'

const FILE_NOTE =
  'SAY WHAT YOU ARE WORKING ON. It takes the run doing the work — the session record filed when that run started ' +
  '— and the records, files and folders it is about. A path naming a folder covers everything under it. If this ' +
  'claim names something another live claim already names, a group opens with both participants and the owner in ' +
  'it, without anybody being asked, and the reply says which groups were opened. The same overlap never opens a ' +
  'second group. A group is opened for two agents at work, so a claim whose earlier run said it finished and is ' +
  'waiting for a check opens none: the reply names that claim and its run under `heldForACheck` instead. A claim ' +
  'that names a task which has been packaged tells the one responsible for that task, in one message from Mole ' +
  'Office carrying a lead to it; the reply names what was sent under `packageTold`, and when nobody responsible ' +
  'can be worked out the claim still succeeds and that entry says nobody was told and why.'

const RENEW_NOTE =
  'SAY THE RUN IS STILL WORKING ON IT. It moves nothing about when the lease ends — that is when the run ends — ' +
  'and it is drawn, so a reader can tell a claim whose run spoke a minute ago from one that has said nothing ' +
  'since it was filed. Only whoever made the claim may renew it.'

const RELEASE_NOTE =
  'SAY YOU HAVE FINISHED WITH IT, with one plain sentence saying why. The claim is kept and marked as released; ' +
  'nothing is deleted. Whoever made the claim may release it. The secretary may also release a claim whose run is ' +
  'not running — one waiting for a check, or one whose run is already over — because nobody else can; a claim of a ' +
  'run that is still running stays its author’s alone. A claim whose run has already ended may still be released, ' +
  'because the run ending and somebody saying they finished are two different facts. An agent started for the work ' +
  'is retired when the card’s retire rule lets the releaser retire it. One it does not is left live, and the answer ' +
  'names it and says why.'

// ============================================================================ what a caller sends

const whichClaim = z.object({ id: z.string().min(1) })
const whichRecord = z.object({ recordId: z.string().min(1) })

const aThing = z.object({ what: z.enum(CLAIMED_KINDS), id: z.string().min(1) })

const fileBody = z.object({
  run: z.string().min(1),
  things: z.array(aThing),
})

const releaseBody = z.object({ because: z.string().default('') })

/** Who is asking, as a participant, or a refusal saying how to become one. */
function whoIsAsking(req: Parameters<typeof actorFrom>[0]): ParticipantRef {
  const actor = actorFrom(req)
  const me = participantForActor(actor)
  if (me === null) {
    throw new PanelError(
      `Nothing in either registry answers to the ${actor.type} "${actor.id}", so there is no work it could claim. ` +
        'GET /api/participants lists every person and every durable agent. A durable agent is registered by ' +
        'filing a record of kind "agent" with the handle you write under.',
      403,
    )
  }
  return me
}

/** One packaged task a claim named, who answers for it, and whether that one was told. */
export interface ToldAboutAClaimedPackage {
  /** The packaged task the claim named. */
  recordId: string
  /** Its title, as the reply and the note name it. */
  title: string
  /** Who is responsible for it, and the sentence saying how that was worked out. */
  responsible: Responsibility
  /** The message sent to the responsible one, or null because nobody could be told. */
  toldId: string | null
  /** One plain sentence, for the answer to the claim that was filed. */
  note: string
}

/**
 * TELL THE ONE RESPONSIBLE FOR EVERY PACKAGED TASK THIS CLAIM NAMED. Criterion F16 point 3.
 *
 * THE WHOLE CONDITION, AND NOTHING ELSE FIRES: a claimed thing of kind `record`, whose record is a
 * `task`, whose `data` carries a readable package. A claim on a path, on a record of another kind, on
 * a record in another project, or on a task nobody has packaged changes nothing and writes nothing
 * extra — most claims in this product are not about packaged tasks and must stay exactly as fast and
 * as quiet as they are today.
 *
 * `responsibleFor` IS THE ONE READER of who answers for a task, so it is called and never copied.
 * The message goes through `writeASystemLineToOne`, the same writer the person's take uses, and it
 * carries a `lead` to the task so the responsible one is taken there in one press rather than handed
 * an id to find. An honest "nobody" is a real answer: no message is sent, the claim still succeeds
 * exactly as it does today, and the entry says why.
 *
 * A CLAIM MAY NAME SEVERAL THINGS, so every packaged task among them is told about. The reply names
 * each one under `packageTold`.
 */
function tellTheResponsibleForPackagedTasks(
  things: readonly ClaimedThing[],
  workspaceId: string,
  claimant: ParticipantRef,
  by: Actor,
): ToldAboutAClaimedPackage[] {
  const told: ToldAboutAClaimedPackage[] = []
  const who = handleOf(claimant)
  for (const thing of things) {
    if (thing.what !== 'record') continue
    const record = getRecord(thing.id)
    if (record === null || record.deletedAt !== null || record.workspaceId !== workspaceId) continue
    if (record.kind !== 'task') continue
    if (packageOf(record.data) === null) continue
    const responsible = responsibleFor(record.id)
    if (responsible.who === null) {
      told.push({
        recordId: record.id,
        title: record.title,
        responsible,
        toldId: null,
        note: `"${record.title}" was claimed, but nobody was told: ${responsible.why}`,
      })
      continue
    }
    const written = writeASystemLineToOne(
      responsible.who,
      workspaceId,
      SYSTEM_LINES.aClaimTookThePackage(record.title, who, claimant.kind),
      by,
      undefined,
      undefined,
      { target: { kind: 'record', recordId: record.id, workspaceId } },
    )
    told.push({
      recordId: record.id,
      title: record.title,
      responsible,
      toldId: written.id,
      note:
        `"${record.title}" was claimed, and ${handleOf(responsible.who)} was sent a message with a lead to it.`,
    })
  }
  return told
}

// ============================================================================ the routes

export async function claimRoutes(app: FastifyInstance): Promise<void> {
  app.get('/claims', route('claim.list', 'remote', LIST_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    return {
      claims: claimsIn(workspaceId),
      live: liveClaimsIn(workspaceId).map((one) => one.id),
      overlaps: overlapsIn(workspaceId),
      workspaceId,
    }
  })

  app.get('/claims/on/:recordId', route('claim.on-a-record', 'remote', ON_RECORD_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(whichRecord, req.params, 'The record asked about')
    // THE RECORD IS READ FIRST, so an id from another project is refused by name rather than
    // answered with an empty list. "Nobody has claimed this" and "that record is in another project"
    // are different facts, and the second one is the one a reader needs.
    recordInWorkspace(asked.recordId, workspaceId, theMessageReader(actorFrom(req)))
    return {
      recordId: asked.recordId,
      claims: liveClaimsOnRecord(asked.recordId, workspaceId),
      overlaps: overlapsOnRecord(asked.recordId, workspaceId),
      workspaceId,
    }
  })

  app.post('/claims', route('claim.file', 'remote', FILE_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const me = whoIsAsking(req)
    const body = parse(fileBody, req.body, 'The claim to file')
    const by = actorFrom(req)
    const filed = fileAClaim(
      { workspaceId, claimant: me, run: body.run, things: body.things as ClaimedThing[] },
      by,
    )
    // ONE MORE THING HAPPENS AFTER THE CLAIM IS FILED, and only for a packaged task. It is checked
    // after `fileAClaim`, so a refused claim sends nothing and a successful one still succeeds even
    // when nobody responsible can be worked out. See `tellTheResponsibleForPackagedTasks`.
    const packageTold = tellTheResponsibleForPackagedTasks(filed.claim.things, workspaceId, me, by)
    reply.code(201)
    return {
      claim: filed.claim,
      groupsOpened: filed.groups,
      heldForACheck: filed.heldForACheck,
      packageTold,
      workspaceId,
    }
  })

  app.post('/claims/:id/renew', route('claim.renew', 'remote', RENEW_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const me = whoIsAsking(req)
    const asked = parse(whichClaim, req.params, 'The claim to renew')
    return { claim: renewAClaim(asked.id, workspaceId, me), workspaceId }
  })

  app.post('/claims/:id/release', route('claim.release', 'remote', RELEASE_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const me = whoIsAsking(req)
    const asked = parse(whichClaim, req.params, 'The claim to release')
    const body = parse(releaseBody, req.body ?? {}, 'Why it is being released')
    // READ FIRST, so a claim in another project is refused by name before anything is written.
    theClaimOrARefusal(asked.id, workspaceId)
    // THE CALLER AS THE REQUEST CARRIED IT, which the retire rule reads for each agent started for the work. An agent
    // the releaser may not retire is left live, and the answer names it beside the claim.
    const { agentsLeftLive, ...claim } = releaseAClaim(asked.id, workspaceId, me, body.because, actorFrom(req))
    return { claim, workspaceId, ...(agentsLeftLive === undefined ? {} : { agentsLeftLive }) }
  })
}
