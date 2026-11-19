// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * DRAFTS, OVER HTTP.
 *
 *   GET  /api/drafts            your own drafts, not sent first; the person sees every draft here
 *   POST /api/drafts/:id/send   the draft's writer sends it
 *   POST /api/drafts/turn       an agent's run says its turn started or ended, and its held messages go
 *
 * A draft is written like any record, through POST /api/records and PATCH /api/records/:id. These are
 * the two acts that are not a record write. The rules are in src/server/lib/drafts.ts; what is here is
 * the door.
 *
 * THE SEND DOOR READS THE DRAFT FIRST, through `recordInWorkspace`: an id from another project is a 404
 * before anything else is asked, and before anything is written.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { writtenFrom } from '../lib/machines.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { listDrafts, sendADraft } from '../lib/drafts.ts'
import { theTurnIs } from '../lib/turn-drafts.ts'
import { DEFAULT_REMIND_AFTER_MINUTES, WHO_MAY_READ_A_DRAFT } from '@shared/drafts.ts'
import { A_PERSONS_TURN_DRAFT_GOES_WITHIN_MINUTES } from '@shared/turn-drafts.ts'

const LIST_NOTE =
  'YOUR DRAFTS IN THIS PROJECT, the ones not sent first, then the ones sent; the one changed most recently comes ' +
  'first in each. Each carries when it was last changed, how many minutes its reminder waits after that ' +
  `(${String(DEFAULT_REMIND_AFTER_MINUTES)} unless the draft names another) and when the reminder is due, or null ` +
  `once it is sent. The person sees every draft in the project. ${WHO_MAY_READ_A_DRAFT} Writes nothing.`

const SEND_NOTE =
  'SEND A DRAFT. No body. Only the draft\'s writer may send it, and a draft is sent once. It files the record the ' +
  'draft becomes (data.becomes: "message", "report" or "note") through the same code POST /api/records uses, so a ' +
  'message is checked, addressed and delivered as any message is. In the same write it links the new record to the ' +
  'draft with derived_from and writes sentAs and sentAt on the draft. A message is made from data.body and ' +
  'data.for, and a draft that becomes a message and names nobody in data.for is refused. A report gets data.body ' +
  'as one text block and the names in data.for as its own for. A note gets data.body alone. The reply carries the ' +
  'draft, the new record and what the new record still wants.'

const TURN_NOTE =
  'AN AGENT\'S RUN SAYS ITS TURN STARTED OR ENDED. Body {"turn":"started"} or {"turn":"ended"}, sent with the run\'s own ' +
  'key; the session hooks send it. From then on the messages the run writes through POST /api/records are held, one ' +
  'turn draft for each set of readers, and go together as one message: at the end of each turn, first when the run ' +
  'reads its inbox, first when it finishes, and to a person, or to a group with a person among its members, within ' +
  `${String(A_PERSONS_TURN_DRAFT_GOES_WITHIN_MINUTES)} minutes. Either call sends what the run holds now. ` +
  'A message written with "urgent": true is never held. The reply names each message sent, and each draft that could ' +
  'not be sent and why.'

const whichDraft = z.object({ id: z.string().min(1) }).strict()
const whichTurn = z.object({ turn: z.enum(['started', 'ended']) }).strict()

export async function draftRoutes(app: FastifyInstance): Promise<void> {
  app.get('/drafts', route('draft.list', 'remote', LIST_NOTE), async (req) => {
    return listDrafts(workspaceOf(req), actorFrom(req))
  })

  app.post('/drafts/turn', route('draft.turn', 'remote', TURN_NOTE), async (req) => {
    const { turn } = parse(whichTurn, req.body ?? {}, 'The turn')
    return theTurnIs(req, turn)
  })

  app.post('/drafts/:id/send', route('draft.send', 'remote', SEND_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichDraft, req.params, 'The draft to send')
    const sent = sendADraft(id, workspaceId, actorFrom(req), writtenFrom(req))
    // THE STATUS POST /api/records ANSWERS FOR THE SAME SEND: 409 for a person's message to a retired
    // addressee, with the letter stored and the routing in the reply.
    reply.status(sent.became.routedARetiredAddressee === true ? 409 : 201)
    return {
      draft: sent.draft,
      became: sent.became.record,
      incomplete: sent.became.incomplete,
      ...(sent.became.links === undefined ? {} : { links: sent.became.links }),
      ...(sent.became.routed === undefined ? {} : { routed: sent.became.routed }),
      // AND THE ADDRESSEES THE OFFICE COULD NOT TELL ABOUT, told the same way POST /api/records tells them.
      ...(sent.became.notRouted === undefined ? {} : { notRouted: sent.became.notRouted }),
      note: sent.note,
    }
  })
}
