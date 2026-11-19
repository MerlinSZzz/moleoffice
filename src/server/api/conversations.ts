// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONVERSATION SYNC'S DOORS. Wave 13s round 242 made them, on a requirement row.
 *
 *   GET  /api/conversations/sync        what this project has opted into, its path map, and a page of the copies
 *   POST /api/conversations/sync        turn it on or off, and set the path map. THE PERSON ONLY.
 *   POST /api/conversations/sync/run    read the latest runs' conversation files and store their scrubbed copies
 *   GET  /api/conversations/:run        one run's scrubbed words, its runtime and the map it was scrubbed with
 *   POST /api/conversations/:run/restore put one copy back on this machine at its mapped checkout and return its
 *                                       resume command
 *
 * The first three are the sync's own; the last two are the useful half of it: a conversation that can be read back
 * and resumed on another machine. Nothing here draws a page, and nothing here reads a record through
 * GET /api/records: the lib reads its run rows in one bounded query of its own.
 *
 * The person turns the sync on and runs it. The files carry secrets and the sync reads a home folder, so the two
 * acts that change what is copied are the person's own, under the same guard as the other person-only doors. A read
 * is open to every caller that reaches the project.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { CONVERSATION_SYNC_PAGE_MAX } from '../../shared/conversation-sync.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { assertThePersonIsProved } from '../lib/records.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import {
  readOneConversation,
  readTheConversationSync,
  restoreOneConversation,
  runTheConversationSync,
  setTheConversationSync,
} from '../lib/conversation-sync.ts'

const onePath = z
  .object({
    token: z.string().min(1).max(40),
    original: z.string().min(1).max(4096),
    mapped: z.string().max(4096).nullable(),
  })
  .strict()

const setBody = z
  .object({
    enabled: z.boolean(),
    paths: z.array(onePath).max(40).optional(),
  })
  .strict()

const restoreBody = z.object({ to: z.string().min(1).max(4096).nullable().optional() }).strict()

const readQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(CONVERSATION_SYNC_PAGE_MAX).optional(),
  })
  .strict()

const oneRun = z.object({ run: z.string().min(1).max(40) }).strict()

const SYNC_READ_NOTE =
  'What this project has opted into for its agents\' conversations: whether the sync is on, the path map that turns ' +
  'an absolute home or checkout path into a token and back, and a page of the copies already made. Each line names ' +
  'the conversation, the run it came from, and the runtime read from that run\'s stored runtime word. No transcript ' +
  'is in this answer; GET /api/conversations/<run> reads one. Writes nothing.'

const SYNC_SET_NOTE =
  'Turn the per-workspace conversation sync on or off, and set the path map it scrubs and restores with. THE PERSON ' +
  'ONLY: the files carry secrets and the sync reads a home folder. `paths` is the whole map, each entry the token, ' +
  'the path it stood for here and the path it is to stand for where the conversation is resumed; leaving it out ' +
  'keeps the map the sync already derived. Writes the one setting row and nothing else.'

const SYNC_RUN_NOTE =
  'Read the latest runs\' conversation files, scrub each one, and store its copy on its own session record. At most ' +
  'the declared number of files, each at most the declared size; a file over either bound, missing, unreadable or ' +
  'under a runtime this release cannot read is counted and said in the reply, never dropped silently. THE PERSON ' +
  'ONLY. Writes the copies and the sync setting\'s last outcome.'

const READ_ONE_NOTE =
  'Read one run\'s scrubbed conversation copy, its runtime, its provider conversation id and the sentence the copy ' +
  'carries. The words have the office\'s secret markers in place of secrets and path tokens in place of the home and ' +
  'checkout paths. Writes nothing.'

const RESTORE_NOTE =
  'Put one scrubbed conversation copy back on this machine where its runtime looks for it, under the mapped ' +
  'checkout path, and return the command that resumes it. A path token with no map entry is refused by name before ' +
  'anything is written. THE PERSON ONLY, because it writes into this machine\'s home and runtime store.'

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/conversations/sync', route('conversation.sync-read', 'remote', SYNC_READ_NOTE), async (req) => {
    actorFrom(req)
    const { limit } = parse(readQuery, req.query ?? {}, 'The read:')
    return readTheConversationSync(workspaceOf(req), limit)
  })

  app.post('/conversations/sync', route('conversation.sync-set', 'remote', SYNC_SET_NOTE), async (req) => {
    const actor = actorFrom(req)
    assertThePersonIsProved(actor, 'Turning the conversation sync on or off', 'The person turns it on or off for their own workspace.', 'Nothing was changed.')
    const input = parse(setBody, req.body ?? {}, 'The sync setting:')
    return setTheConversationSync(workspaceOf(req), input)
  })

  app.post('/conversations/sync/run', route('conversation.sync-run', 'remote', SYNC_RUN_NOTE), async (req) => {
    const actor = actorFrom(req)
    assertThePersonIsProved(actor, 'Running the conversation sync', 'The person runs the sync for their own workspace.', 'Nothing was read and nothing was written.')
    return runTheConversationSync(workspaceOf(req), actor)
  })

  app.get('/conversations/:run', route('conversation.read', 'remote', READ_ONE_NOTE), async (req) => {
    actorFrom(req)
    const { run } = parse(oneRun, req.params, 'The run asked for:')
    return readOneConversation(workspaceOf(req), run)
  })

  app.post('/conversations/:run/restore', route('conversation.restore', 'remote', RESTORE_NOTE), async (req) => {
    const actor = actorFrom(req)
    assertThePersonIsProved(actor, 'Restoring a conversation', 'The person restores a copy on their own machine.', 'Nothing was written.')
    const { run } = parse(oneRun, req.params, 'The run asked for:')
    const { to } = parse(restoreBody, req.body ?? {}, 'The restore:')
    return restoreOneConversation(workspaceOf(req), run, actor, to ?? null)
  })
}
