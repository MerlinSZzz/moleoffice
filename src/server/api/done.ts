// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD MARKED DONE IN ONE CALL, OVER HTTP. Wave 13s round 142, item 38 of the line's requirements.
 *
 *   POST /api/records/:id/done   {} for a task or a backlog item, {"note": "…"} for an obligation
 *
 * The rules are `markDone` in src/server/lib/done.ts; what is here is the door. It reads the record in this project, or
 * answers 404 naming the project it is in, and it writes as the caller, as every record write does.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { markDone, THE_KINDS_MARKED_DONE } from '../lib/done.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theMessageReader } from '../lib/messages.ts'
import { recordInWorkspace, whyAnUnregisteredAgentMayNotWrite } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'

const DONE_NOTE =
  `MARK A RECORD DONE IN ONE CALL: ${THE_KINDS_MARKED_DONE}. A task or a backlog item is sent with no body, or {}, ` +
  'and is left "done". An obligation takes {"note": "<what settled it>"} and is fulfilled as POST /api/records/:id/fulfil ' +
  'fulfils it; a daily one has its next day written in the same write. A record already done is not written again, ' +
  'and the reply says so. Any other kind is refused, and so is a note on a kind that keeps none. The reply is ' +
  '{record, incomplete, alreadyDone, doneNote}.'

const idParams = z.strictObject({ id: z.string().min(1) })
const doneBody = z.strictObject({ note: z.string().optional() })

export async function doneRoutes(app: FastifyInstance): Promise<void> {
  app.post('/records/:id/done', route('record.done', 'remote', DONE_NOTE), async (req) => {
    const { id } = parse(idParams, req.params, 'The URL is not usable:')
    const { note } = parse(doneBody, req.body ?? {}, 'The request body is not usable:')
    const actor = actorFrom(req)
    const no = whyAnUnregisteredAgentMayNotWrite(actor)
    if (no !== null) throw new PanelError(no, 403)
    // In this project, or a 404 naming the project it is really in.
    const record = recordInWorkspace(id, workspaceOf(req), theMessageReader(actor))
    const done = markDone(record, note, actor)
    return { record: done.record, incomplete: done.incomplete, alreadyDone: done.alreadyDone, doneNote: done.note }
  })
}
