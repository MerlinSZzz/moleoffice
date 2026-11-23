// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The HTTP doors for the knowledge library. They connect requests to the library's operations
 * and report whether a write is waiting for review.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { levelNamed } from '@shared/results-at-a-level.ts'
import { usableQuery } from '@shared/search.ts'
import { KNOWLEDGE_WORDS as w } from '@shared/words/en-wave-13u.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { categoryQuery, firstQuery, wordSearch } from '../knowledge/query.ts'
import { rateEntry } from '../knowledge/ratings.ts'
import { knowledgeCounts } from '../knowledge/counts.ts'
import { answerChange, bookmark, createCategory, createEntry, editEntry, moveCategory, readCategory, readEntry, rootCategories } from '../knowledge/library.ts'
import { changeAttachment } from '../knowledge/attachments.ts'

const categoriesQuery = z.strictObject({ ids: z.string().min(1) })
const wordsQuery = z.strictObject({ q: z.string().refine(usableQuery), level: z.string().refine(word => levelNamed(word) !== null).optional() })
const params = z.strictObject({ id: z.string().min(1) })
const attachmentQuery = z.strictObject({ project: z.string().min(1), flow: z.string().min(1), step: z.coerce.number().int().positive() })
/** Register the library doors and their response statuses. */
export async function knowledgeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/knowledge/counts', route('knowledge.counts', 'remote', w.doors.counts), async req => {
    const query = req.query as { from?: unknown; to?: unknown }
    return knowledgeCounts(query.from, query.to)
  })
  app.post('/knowledge/entries/:id/ratings', route('knowledge.ratings', 'remote', w.doors.ratings), async (req, reply) => {
    const result = rateEntry(parse(params, req.params, w.invalid).id, req.body, actorFrom(req), workspaceOf(req))
    reply.code(201); return result
  })
  app.get('/knowledge/query', route('knowledge.query', 'remote', w.doors.firstQuery), async req => firstQuery(actorFrom(req), workspaceOf(req)))
  app.get('/knowledge/query/categories', route('knowledge.queryCategories', 'remote', w.doors.categoryQuery), async req => {
    const query = parse(categoriesQuery, req.query, w.invalid)
    const ids = query.ids.split(',').map(id => id.trim())
    if (ids.some(id => id === '')) throw new PanelError(w.invalid, 400)
    return categoryQuery([...new Set(ids)], actorFrom(req), workspaceOf(req))
  })
  app.get('/knowledge/search', route('knowledge.search', 'remote', w.doors.wordSearch), async req => {
    const query = parse(wordsQuery, req.query, w.invalid)
    return wordSearch(query.q.trim(), query.level === undefined ? null : levelNamed(query.level), query.level, actorFrom(req), workspaceOf(req))
  })
  app.get('/knowledge/categories', route('knowledge.categories', 'remote', w.doors.roots), async () => rootCategories())
  app.post('/knowledge/categories', route('knowledge.categoryCreate', 'remote', w.doors.categoryCreate), async (req, reply) => {
    const result = createCategory(req.body, actorFrom(req)); reply.code(201); return result
  })
  app.post('/knowledge/categories/:id/move', route('knowledge.categoryMove', 'remote', w.doors.categoryMove), async req => moveCategory(parse(params, req.params, w.invalid).id, req.body, actorFrom(req)))
  app.get('/knowledge/categories/:id', route('knowledge.categoryRead', 'remote', w.doors.categoryRead), async req => readCategory(parse(params, req.params, w.invalid).id))
  app.post('/knowledge/entries', route('knowledge.create', 'remote', w.doors.create), async (req, reply) => {
    const result = createEntry(req.body, actorFrom(req), workspaceOf(req)); reply.code(result.waiting ? 202 : 201); return result
  })
  app.get('/knowledge/entries/:id', route('knowledge.read', 'remote', w.doors.read), async req => readEntry(parse(params, req.params, w.invalid).id, actorFrom(req), workspaceOf(req)))
  app.patch('/knowledge/entries/:id', route('knowledge.edit', 'remote', w.doors.edit), async (req, reply) => {
    const result = editEntry(parse(params, req.params, w.invalid).id, req.body, actorFrom(req), workspaceOf(req))
    reply.code(result.waiting ? 202 : 200); return result
  })
  app.post('/knowledge/changes/:id/confirm', route('knowledge.confirm', 'remote', w.doors.confirm), async req => answerChange(parse(params, req.params, w.invalid).id, req.body, actorFrom(req), 'confirm'))
  app.post('/knowledge/changes/:id/refuse', route('knowledge.refuse', 'remote', w.doors.refuse), async req => answerChange(parse(params, req.params, w.invalid).id, req.body, actorFrom(req), 'refuse'))
  app.post('/knowledge/entries/:id/bookmarks', route('knowledge.bookmark', 'remote', w.doors.bookmark), async (req, reply) => {
    const result = bookmark(parse(params, req.params, w.invalid).id, workspaceOf(req), actorFrom(req)); reply.code(201); return result
  })
  app.post('/knowledge/entries/:id/attachments', route('knowledge.attach', 'remote', w.doors.attach), async req =>
    changeAttachment(parse(params, req.params, w.invalid).id, req.body, actorFrom(req), true))
  app.delete('/knowledge/entries/:id/attachments', route('knowledge.detach', 'remote', w.doors.detach), async req =>
    changeAttachment(parse(params, req.params, w.invalid).id, parse(attachmentQuery, req.query, w.attachmentInvalid), actorFrom(req), false))
}
