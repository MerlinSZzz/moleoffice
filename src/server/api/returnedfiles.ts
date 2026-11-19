// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ZIP SOMEBODY BROUGHT BACK FROM OUTSIDE, OVER HTTP.
 *
 *   GET  /api/returned-files    what may be sent: the largest size and the one type
 *   POST /api/returned-files    put a zip where a later record can point at it
 *
 * Criterion F16, point 5, of design/flows/ACCEPTANCE.md. What this door is for, where the file goes, why an upload is
 * refused when its directory is outside every preview root, and the promise that the office never
 * opens the archive, are all in src/server/lib/returnedfiles.ts beside the rules they explain.
 *
 * NOTHING HERE REPEATS A RULE. The size, the type, the four-byte zip check, the base64 shape and
 * the directory check all live in that one file; this file turns them into two routes and the
 * sentences GET /api publishes.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parse } from '../lib/parse.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import {
  RETURNED_FILE_EXTENSION,
  RETURNED_FILE_MIME,
  RETURNED_FILE_TYPE_READ,
  decodeReturnedFileBase64,
  maxReturnedFileBytes,
  storeAReturnedFile,
} from '../lib/returnedfiles.ts'

// ============================================================================ the sentences

const RETURNED_FILE_LIMITS_NOTE =
  'WHAT MAY BE SENT AS A RETURNED FILE: the largest size in bytes and the one type. Read it before you ' +
  'send one, so a person choosing a file is told the limit rather than refused after choosing. The number ' +
  'comes from the same declaration the refusal uses, and the one type is a zip. Criterion F16, point 5.'

const RETURNED_FILE_NOTE =
  'PUT A ZIP WHERE A LATER RECORD CAN POINT AT IT. Body {"bytes": "<the file, base64>"}. It writes NO ' +
  'record: it writes the file and hands back the path, and the record that points at it is written later ' +
  'through the ordinary record door. It takes a zip and nothing else, and the office NEVER OPENS IT: only ' +
  'the first four bytes are read, to check that the sender really sent a zip, and the archive is never ' +
  'listed, never extracted and never read past those four bytes. The file is stored beside the pictures, ' +
  'under the directory holding the database, and it is kept as long as the record that points at it: ' +
  'nothing prunes it. The size limit is MOLE_OFFICE_RETURNED_FILE_MAX_BYTES, and an upload is refused ' +
  'before anything is written when the database sits where no preview root can serve the file back. ' +
  'Criterion F16, point 5.'

// ============================================================================ what a caller sends

/**
 * The body, with `bytes` optional so THAT refusal is this door's own sentence and not zod's.
 *
 * "There is no file here" and "the file arrived as a string that is not base64" are two different
 * facts, and the door says which. A missing `bytes` is refused below with a sentence that says
 * nothing was written, the way every other refusal on this route does.
 */
const aReturnedFileSent = z.object({ bytes: z.string().optional() }).strict()

/**
 * The largest JSON body the returned-file route reads, from the same number the size check reads.
 *
 * Base64 is four bytes on the wire for every three of file, and the JSON around it a little more
 * again — so the room here is four times the setting, plus a third, plus an allowance for the rest
 * of the body. A file up to four times the limit therefore reaches `storeAReturnedFile`, which
 * refuses it naming both numbers, instead of meeting Fastify's own wordless refusal. The same
 * arithmetic and the same reason as `bodyLimitForAPicture` in api/messages.ts.
 */
const BODIES_THIS_ROUTE_WILL_READ = 4
const JSON_AROUND_A_FILE = 4096
function bodyLimitForAReturnedFile(limit: number): number {
  return Math.ceil((limit * BODIES_THIS_ROUTE_WILL_READ * 4) / 3) + JSON_AROUND_A_FILE
}

/** What a caller reads when the body is past even that, in place of *Request body is too large*. */
function pastEvenTheBodyLimit(limit: number, bodyLimit: number): string {
  return (
    'Nothing was read, because that request is bigger than this route reads at all. A returned file is at ' +
    `most ${String(limit)} bytes. This route stops reading at ${String(bodyLimit)} bytes of request, which is ` +
    `about ${String(limit * BODIES_THIS_ROUTE_WILL_READ)} bytes of file. How big this one is was never ` +
    'measured, so nothing here says. Nothing was written. The limit is MOLE_OFFICE_RETURNED_FILE_MAX_BYTES.'
  )
}

/** Fastify's own code for a body past the route's limit, which is the one refusal this route rewrites. */
const BODY_TOO_LARGE = 'FST_ERR_CTP_BODY_TOO_LARGE'

// ============================================================================ the routes

export async function returnedFilesRoutes(app: FastifyInstance): Promise<void> {
  // READ ONCE, HERE, AND USED FOR BOTH THE LIMIT AND THE SENTENCE, for the reason api/messages.ts
  // reads its own once: two calls would be the same fact worked out twice, and a setting that
  // changed between them would put a number in the refusal that is not the number being enforced.
  const limit = maxReturnedFileBytes()
  const bodyLimit = bodyLimitForAReturnedFile(limit)

  /**
   * WHAT MAY BE SENT, so a person choosing a file is told before anything is refused. Criterion F16,
   * point 5: the size and the one type are published here from the same declarations the refusal
   * uses, so the sentence and the rule cannot come apart.
   */
  app.get('/returned-files', route('returned-file.limits', 'remote', RETURNED_FILE_LIMITS_NOTE), async () => ({
    returnedFile: {
      maxBytes: maxReturnedFileBytes(),
      type: RETURNED_FILE_MIME,
      types: [RETURNED_FILE_EXTENSION],
      said: RETURNED_FILE_TYPE_READ,
    },
  }))

  app.post(
    '/returned-files',
    {
      bodyLimit,
      // FASTIFY'S OWN REFUSAL DOES NOT REACH A CALLER OF THIS ROUTE. Everything else is handed to
      // the one error handler the server installs, so this adds a sentence and changes nothing else.
      errorHandler: (error, request, reply) => {
        if ((error as { code?: unknown }).code === BODY_TOO_LARGE) {
          return reply.status(413).send({ error: pastEvenTheBodyLimit(limit, bodyLimit) })
        }
        return app.errorHandler(error, request, reply)
      },
      ...route('returned-file.store', 'remote', RETURNED_FILE_NOTE),
    },
    async (req, reply) => {
      const sent = parse(aReturnedFileSent, req.body ?? {}, 'The returned file')
      if (sent.bytes === undefined) {
        throw new PanelError('That returned file is empty: the body carried no bytes. Nothing was written.', 400)
      }
      const workspaceId = workspaceOf(req)
      const bytes = decodeReturnedFileBase64(sent.bytes)
      const stored = storeAReturnedFile(bytes, workspaceId)
      reply.code(201)
      return { returnedFile: stored }
    },
  )
}
