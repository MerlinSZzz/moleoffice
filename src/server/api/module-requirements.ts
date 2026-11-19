// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { sayInEnglish } from '@shared/i18n.ts'
import { z } from 'zod'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { recordInWorkspace, throughTheRecordDoor } from '../lib/records.ts'
import { theMessageReader } from '../lib/messages.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { updateModuleRequirements } from '../lib/updating-module-requirements.ts'

const body = z.strictObject({
  items: z.array(z.record(z.string(), z.unknown())),
  ifVersion: z.string().optional(),
})

export async function moduleRequirementsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/records/:id/requirements', route(
    'record.requirements', 'remote',
    sayInEnglish('server.moduleRequirementsDoor'),
  ), async req => {
    const actor = actorFrom(req)
    const { id } = parse(z.object({ id: z.string().min(1) }), req.params, 'The URL is not usable:')
    const input = parse(body, req.body, 'The request body is not usable:')
    const record = recordInWorkspace(id, workspaceOf(req), theMessageReader(actor))
    return throughTheRecordDoor(id, () => updateModuleRequirements(record, input.items, actor, input.ifVersion))
  })
}
