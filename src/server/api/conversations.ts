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
 *   GET  /api/conversations/:run/export  the look first: what one run's export would hold. THE PERSON ONLY.
 *   POST /api/conversations/:run/export  the export: one zip with the parts the person ticks. THE PERSON ONLY.
 *
 * The first three are the sync's own; the last two are the useful half of it: a conversation that can be read back
 * and resumed on another machine. Nothing here draws a page, and nothing here reads a record through
 * GET /api/records: the lib reads its run rows in one bounded query of its own.
 *
 * The person turns the sync on and runs it. The files carry secrets and the sync reads a home folder, so the two
 * acts that change what is copied are the person's own, under the same guard as the other person-only doors. A read
 * is open to every caller that reaches the project.
 *
 * The three presses are kept on this computer, because turning the sync on and running it read the coding tools'
 * files in this computer's home folder and a restore writes into it. A caller from another computer is refused
 * before any handler runs. The two reads may be asked from another computer.
 *
 * The two export doors are kept on this computer too, and are the person's own, because they read the run's
 * conversation file in this computer's home folder and the agent's personal space and memory folder, and the export
 * carries them off it. Neither writes anything. The reading is src/server/lib/conversation-export.ts.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { CONVERSATION_SYNC_PAGE_MAX } from '../../shared/conversation-sync.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theActKeptHere } from '../lib/reach.ts'
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
import { exportOneConversation, lookAtAConversationExport } from '../lib/conversation-export.ts'

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

const exportBody = z
  .object({
    parts: z.object({ notebook: z.boolean(), memory: z.boolean(), space: z.boolean(), address: z.boolean() }).strict(),
    looked: z.boolean(),
  })
  .strict()

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

const EXPORT_LOOK_NOTE =
  'The look first at one run\'s export: what the file would hold with every part ticked. Each piece says whether ' +
  'it would go or is not there, with its entries, their sizes and what the scrub did; then the files left out with ' +
  'why, the files that would travel byte for byte unscreened, and every finding of the screen. A part the agent ' +
  'lacks is an answer, not an error. THE PERSON ONLY. Writes nothing.'

const EXPORT_NOTE =
  'Export one run\'s conversation as a zip: the manifest, the conversation read whole and scrubbed, the current ' +
  'handover, and each of the notebook, the memory folder, the personal space and the name and address that `parts` ' +
  'ticks and the agent has. `looked` says the person has seen what the look found; with something to look at and ' +
  'no look, nothing is made. A refusing finding or a key hash this office issued stops it by name. THE PERSON ' +
  'ONLY. Answers the file itself. Writes nothing.'

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/conversations/sync', route('conversation.sync-read', 'remote', SYNC_READ_NOTE), async (req) => {
    actorFrom(req)
    const { limit } = parse(readQuery, req.query ?? {}, 'The read:')
    return readTheConversationSync(workspaceOf(req), limit)
  })

  app.post(
    '/conversations/sync',
    route(
      'conversation.sync-set',
      'local',
      { because: 'acts-on-this-machine', act: 'Turning the conversation sync on or off' },
      SYNC_SET_NOTE,
    ),
    async (req) => {
      const actor = actorFrom(req)
      assertThePersonIsProved(actor, theActKeptHere(req), 'The person turns it on or off for their own workspace.', 'Nothing was changed.')
      const input = parse(setBody, req.body ?? {}, 'The sync setting:')
      return setTheConversationSync(workspaceOf(req), input)
    },
  )

  app.post(
    '/conversations/sync/run',
    route(
      'conversation.sync-run',
      'local',
      { because: 'acts-on-this-machine', act: 'Running the conversation sync' },
      SYNC_RUN_NOTE,
    ),
    async (req) => {
      const actor = actorFrom(req)
      assertThePersonIsProved(actor, theActKeptHere(req), 'The person runs the sync for their own workspace.', 'Nothing was read and nothing was written.')
      return runTheConversationSync(workspaceOf(req), actor)
    },
  )

  app.get('/conversations/:run', route('conversation.read', 'remote', READ_ONE_NOTE), async (req) => {
    actorFrom(req)
    const { run } = parse(oneRun, req.params, 'The run asked for:')
    return readOneConversation(workspaceOf(req), run)
  })

  app.post(
    '/conversations/:run/restore',
    route(
      'conversation.restore',
      'local',
      { because: 'acts-on-this-machine', act: 'Restoring a conversation' },
      RESTORE_NOTE,
    ),
    async (req) => {
      const actor = actorFrom(req)
      assertThePersonIsProved(actor, theActKeptHere(req), 'The person restores a copy on their own machine.', 'Nothing was written.')
      const { run } = parse(oneRun, req.params, 'The run asked for:')
      const { to } = parse(restoreBody, req.body ?? {}, 'The restore:')
      return restoreOneConversation(workspaceOf(req), run, actor, to ?? null)
    },
  )

  app.get(
    '/conversations/:run/export',
    route(
      'conversation.export-look',
      'local',
      { because: 'acts-on-this-machine', act: 'Looking over a conversation export' },
      EXPORT_LOOK_NOTE,
    ),
    async (req) => {
      const actor = actorFrom(req)
      assertThePersonIsProved(actor, theActKeptHere(req), 'The person looks at an export from their own workspace.', 'Nothing was read.')
      const { run } = parse(oneRun, req.params, 'The run asked for:')
      return lookAtAConversationExport(workspaceOf(req), run)
    },
  )

  app.post(
    '/conversations/:run/export',
    route(
      'conversation.export',
      'local',
      { because: 'acts-on-this-machine', act: 'Exporting a conversation' },
      EXPORT_NOTE,
    ),
    async (req, reply) => {
      const actor = actorFrom(req)
      assertThePersonIsProved(actor, theActKeptHere(req), 'The person exports a conversation from their own workspace.', 'Nothing was made.')
      const { run } = parse(oneRun, req.params, 'The run asked for:')
      const ask = parse(exportBody, req.body ?? {}, 'The export:')
      const made = exportOneConversation(workspaceOf(req), run, ask)
      void reply.type('application/zip')
      void reply.header('content-disposition', `attachment; filename="${made.fileName}"`)
      return made.zip
    },
  )
}
