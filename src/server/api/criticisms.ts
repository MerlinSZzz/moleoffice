// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The doors for filing and reading independent criticism of a record. */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { criticismsOf, fileACriticism } from '../lib/criticism.ts'

const FILE_NOTE = 'File a criticism about this record. The office refuses its author as the independent critic and writes the independent mark.'
const LIST_NOTE = 'Read criticisms about this record, their authors and critics, and whether they came through the independent step.'
const whichWork = z.object({ id: z.string().min(1) }).strict()
const body = z.object({
  title: z.string().min(1), summary: z.string().optional(),
  data: z.object({ tried: z.string(), got_in_the_way: z.string(), did_instead: z.string(), wants_changed: z.string(), evidence: z.array(z.string()).optional() }).strict(),
}).strict()

export async function criticismRoutes(app: FastifyInstance): Promise<void> {
  app.post('/records/:id/criticisms', route('criticism.file', 'remote', FILE_NOTE), async (req, reply) => {
    const { id } = parse(whichWork, req.params, 'The work:')
    const input = parse(body, req.body ?? {}, 'The criticism:')
    const result = fileACriticism({ aboutId: id, workspaceId: workspaceOf(req), actor: actorFrom(req), ...input })
    reply.status(201)
    return result
  })
  app.get('/records/:id/criticisms', route('criticism.list', 'remote', LIST_NOTE), async req => {
    const { id } = parse(whichWork, req.params, 'The work:')
    const actor = actorFrom(req)
    return criticismsOf(id, workspaceOf(req), actor)
  })
}
