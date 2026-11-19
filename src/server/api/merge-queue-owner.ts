// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE'S OWNER: ONE AGENT, NAMED BY THE PERSON. A decision settled it, with the answers
 * lOBUitZaMl1N and EI3_Msuradr7.
 *
 *   GET  /api/office/merge-queue-owner   who owns the merge queue, or why nobody does
 *   POST /api/office/merge-queue-owner   the person names one agent, or names nobody
 *
 * Built like the dead-letter secretary (src/server/api/dead-letter-secretary.ts). Both halves are remote: the setting
 * belongs to the office, so the person may read and change it from any machine they open Mole Office on. What keeps
 * the write theirs is the actor clause below, not the machine.
 *
 * THE DOOR CHECKS EVERYTHING BEFORE IT WRITES ANYTHING. Who is asking is checked first, then the body, then whether
 * the agent qualifies, and only then is the one column written.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { gatePosition } from '../../config/settings.mjs'
import { gateMet } from '../lib/gate-counts.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { setTheMergeQueueOwner, theMergeQueueOwner, type TheMergeQueueOwner } from '../lib/merge-queue-owner.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import { aRaiseCarriesIt, writeDownASettingChange, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'
import { whoMayDoThePersonsActsHere } from '../lib/worldauthority.ts'

const READ_NOTE =
  "Who owns the merge queue: besides the person, the one agent that may move a merge entry to the front of its lane " +
  "(POST /api/merge-queue/<id>/first), with its own key. Kept on the office's installation row. Read only, and no body " +
  'is read. The reply is {named, nobodyBecause, stored, storedName, says, mayBeNamed}. named is null when nobody ' +
  'qualifies, and nobodyBecause says why: "nobody chose", "not registered", "retired" or "not a secretary". It never ' +
  'falls back to any secretary: with nobody named, only the person may move an entry.'

const SET_NOTE =
  'Name the merge queue\'s owner. Body {"agent": "<handle or id>" | null}; null names nobody. The agent must be ' +
  "registered, not retired, and hold the secretary's card. This is the owner's own act. A secretary holding the " +
  "owner's grant may press it where this office's list of what the grant carries says so; any other agent is " +
  'refused and the refusal names who may. The reply is the reading as it now stands.'

/** The one value a person may set. */
const setBody = z.strictObject({ agent: z.string().trim().min(1).nullable() })

/**
 * ONLY THE PERSON, WHOEVER HOLDS THE PERSON'S AUTHORITY IN A TEST WORLD, OR A SECRETARY THE PERSON HAS RAISED, MAY NAME
 * THE OWNER. The same clause the dead-letter secretary asks, with its own sentence so the refusal says what this act is.
 * An agent may read the setting and may file a proposal about it; it may not choose who owns the queue, because that
 * would let it choose who may jump the queue.
 */
function onlyThePersonMayNameTheOwner(actor: Actor): void {
  if (thePersonIsProved(actor)) return
  if (actor.theOwnersAuthority?.holds === true) return
  // AND A SECRETARY THE PERSON HAS RAISED. A raised secretary holds the person's rights except three (closing the
  // key window, changing the regulations, changing who the owner is), and this is not one of
  // them. Asked last, so the grant is named on the act only when nothing else allowed it.
  // THE GATE IS READ BEFORE THE RAISE IS ASKED. At off the gate who-names-the-merge-queue-owner lets any caller name the
  // owner, so the raise is not asked, refuses nobody and has nothing written down under it. At block the raise is asked
  // as before, and a change it carries is not counted as one the gate would hold.
  const position = gatePosition('who-names-the-merge-queue-owner')
  if (position === 'block' && aRaiseCarriesIt(actor)) return
  if (gateMet('who-names-the-merge-queue-owner', position!) !== 'block') return
  const inAWorld = whoMayDoThePersonsActsHere()
  throw new PanelError(
    `Who owns the merge queue is the owner's own setting, and this request was made by "${actor.id}", which is not ` +
      'the owner. Nothing was changed. ' +
      (inAWorld === null ? '' : `${inAWorld} `) +
      'The owner names the merge queue\'s owner on the Settings page. An agent may read it and may file a proposal ' +
      'about it; it may not choose who owns the merge queue.',
    403,
    undefined,
    undefined,
    undefined,
    { code: 'mergeQueueOwnerOwnerNotProved', values: {} },
  )
}

export async function mergeQueueOwnerRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/merge-queue-owner',
    route('office.merge-queue-owner', 'remote', READ_NOTE),
    async (): Promise<TheMergeQueueOwner> => theMergeQueueOwner(),
  )

  app.post(
    '/office/merge-queue-owner',
    route('office.set-merge-queue-owner', 'remote', SET_NOTE),
    async (req): Promise<TheMergeQueueOwner> => {
      const actor = actorFrom(req)
      onlyThePersonMayNameTheOwner(actor)
      const body = parse(setBody, req.body ?? {}, "The merge queue's owner")
      // THE AGENT MAY BE NAMED BY ITS ID OR ITS HANDLE, criterion I2. The one resolver says which agent it is, and the
      // setting stores its registry id. A name nobody bears is refused here, before anything.
      let id: string | null = null
      if (body.agent !== null) {
        const found = theAgentAnArrivingReferenceNames(body.agent, 'writing')
        if (found === null) {
          throw new PanelError(
            `No agent here answers to "${body.agent}", so it cannot own the merge queue. ` +
              'GET /api/office/merge-queue-owner lists the agents that may. Nothing was changed.',
            400,
            undefined,
            undefined,
            undefined,
            { code: 'mergeQueueOwnerNoSuchAgent', values: {} },
          )
        }
        id = found.agent.id
      }
      const before = theMergeQueueOwner()
      const after = setTheMergeQueueOwner(id)
      // WHAT WAS CHOSEN: the stored id, or null for nobody (problem 4f6oWJdzJbnk keeps every change).
      writeDownASettingChange(actor, {
        setting: 'merge-queue-owner',
        field: "the merge queue's owner",
        before: before.stored,
        after: after.stored,
        workspaceId: workspaceOf(req),
      })
      return after
    },
  )
}
