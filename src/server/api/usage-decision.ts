// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE USAGE NOTICE AT 80% SAYS TO DO, AND THE USAGE DECISION THOSE WORDS COME FROM. Wave 13y round 136.
 *
 *   GET  /api/office/usage-decision   the words in force, and the decision they come from
 *   POST /api/office/usage-decision   set the words and the decision, or neither
 *
 * The reader and the writer are in lib/usage-notices.ts. Both halves are remote: the setting belongs to the office, so
 * it may be read and changed from any machine the office is opened on. What keeps the write in the right hands is the
 * actor clause below, not the machine.
 *
 * THE WORDS ARE THE OWNER'S. The owner sets them with a press. A secretary proved by its own key sets them only when it
 * carries the owner's written words for that exact change. A raise does not carry it, and an agent's key alone is
 * refused.
 *
 * THE DOOR CHECKS EVERYTHING BEFORE IT WRITES ANYTHING. Who is asking is checked first, then the body and the owner's
 * words, then whether the words and the decision fit, and only then is the one change row written.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { actorFrom, actorWithTheWordsItActsOn, theWordsInTheBody } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { thePersonIsProved, theWordsAllowThis } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { setTheUsageDecision, theUsageDecision, type TheUsageDecision } from '../lib/usage-notices.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { warrantBody } from './records.ts'
import { aSecretaryWithItsOwnKey } from './runtime-settings.ts'

const READ_NOTE =
  "What the notice says to do when the sandboxes' Claude login has used 80% of its seven days, and the usage " +
  'decision those words come from. Read only, and no body is read. The reply is {inForce, everSet, because, says}. ' +
  'inForce.from is "set here" (with whatToDo and decision) or "not set", and then the notice asks the secretary to ' +
  'ask the owner.'

const SET_NOTE =
  "Set what the 80% usage notice of the sandboxes' Claude login says to do. Body {whatToDo: \"<words>\" | null, " +
  'decision: "<the decision record\'s id>" | null, because: "<why>", warrant}; the words and the id come together, or ' +
  'both as null for nothing set. The record must be a decision that is not deleted. The owner may. A secretary proved ' +
  'by its own key may only with the owner\'s written words in warrant, for the act office.set-usage-decision:' +
  '{"whatToDo":…,"decision":…} exactly as sent. A raise or an agent\'s key alone is refused. Every change is kept with ' +
  'who, when and why. The reply is the reading as it now stands.'

/** What a caller may send: the words and the decision, or neither, a reason, and the owner's words. */
const setBody = z.strictObject({
  whatToDo: z.string().trim().min(1).nullable(),
  decision: z.string().trim().min(1).nullable(),
  because: z.string().optional(),
  warrant: warrantBody.optional(),
})

/** The refusal for anybody but the owner, or a secretary carrying the owner's words for this exact change. */
function notTheirsToSet(id: string): PanelError {
  return new PanelError(
    `What the usage notice at 80% says to do is set by the owner, or by a secretary using its own key and carrying the ` +
      `owner's written words for this exact change, and this request was made by "${id}" without them. A raise or an ` +
      "agent's key alone does not carry it. Nothing was changed.",
    403,
  )
}

export async function usageDecisionRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/usage-decision',
    route('office.usage-decision', 'remote', READ_NOTE),
    async (): Promise<TheUsageDecision> => theUsageDecision(),
  )

  app.post(
    '/office/usage-decision',
    route('office.set-usage-decision', 'remote', SET_NOTE),
    async (req): Promise<TheUsageDecision> => {
      const plain = actorFrom(req)
      const person = thePersonIsProved(plain)
      const words = theWordsInTheBody(req)
      if (!person && (words === undefined || !aSecretaryWithItsOwnKey(plain))) throw notTheirsToSet(plain.id)
      const body = parse(setBody, req.body ?? {}, 'The usage decision')
      // THE OWNER'S WORDS MUST NAME THIS CHANGE: the words and the decision exactly as sent.
      const actor = actorWithTheWordsItActsOn(req, body.warrant, `office.set-usage-decision:${JSON.stringify({ whatToDo: body.whatToDo, decision: body.decision })}`)
      if (!person && !(actor.signedItem === undefined && theWordsAllowThis(actor))) throw notTheirsToSet(plain.id)
      const because = body.because?.trim() ? body.because.trim() : null
      return setTheUsageDecision(actor, body.whatToDo, body.decision, because, workspaceOf(req))
    },
  )
}
