// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The annotation routes: find one remark from its id, and ask forty at once whether they are stale.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE EXIST WHEN A REMARK IS ALREADY A RECORD
 * ---------------------------------------------------------------------------------------
 *
 * A remark is a record of kind `annotation`, so `GET /api/records/<id>` hands one back and always
 * did. It answers with the words and the stored context, and it cannot answer either of the two
 * questions a review list asks on every single row:
 *
 *   HAS THE QUOTE GONE STALE? A reading is computed and never stored. Measured on 18 August 2026, a
 *   list with two stale quotes out of seven drew all seven rows the same, because asking cost a
 *   request per row and so nothing asked.
 *
 *   WHERE DO I GO TO SEE IT? Which record or plan, which block, which words.
 *
 * Everything either route does lives in src/server/lib/annotations.ts. This is the door.
 *
 *   GET  /api/annotations/:id         one remark: where it is, and whether it still holds
 *   POST /api/annotations/readings    the same reading for a whole list, in one request
 *
 * THERE IS NO WRITE HERE. A remark is written, changed and deleted through the record routes,
 * because it is a record — POST /api/records with kind "annotation". A second write door would be a
 * second set of rules about somebody's own words.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  MAX_READINGS,
  readAnnotation,
  readAnnotations,
  type AnnotationReadings,
  type AnnotationView,
} from '../lib/annotations.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theMessageReader } from '../lib/messages.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'

// ---------------------------------------------------------------------------- input shapes

const annotationIdParams = z.object({
  id: z.string().min(1, {
    error: 'the URL must contain the id of a comment — GET /api/records?kind=annotation lists them',
  }),
})

const readingsBody = z.strictObject({
  ids: z
    .array(z.string().min(1, { error: 'each id is the record id of one comment' }))
    .max(MAX_READINGS, {
      error: `ask about at most ${String(MAX_READINGS)} comments at once`,
    }),
})

// ---------------------------------------------------------------------------- routes

export async function annotationRoutes(app: FastifyInstance): Promise<void> {
  /** One remark, with enough to take somebody to the thing it is about. */
  app.get(
    '/annotations/:id',
    route(
      'review.comments',
      'remote',
      'One comment somebody left on something, with everything needed to go to what it is about: which record or ' +
        'plan it is in and what that is called, which block, and which words with where they were and which ' +
        'stored string they came from. `leftOn` is the one phrase a screen prints for where it was left — the ' +
        'part and the record it is in, as "the table in the report \\"Round eight\\"" — so a comment on a ' +
        'paragraph and a comment on the whole report do not read alike. `key` is the same string an addressable ' +
        'element on screen carries as its ' +
        '`data-target`, so a page can find the element it drew. `reading` says whether what it points at is ' +
        'still there and whether the quoted words have moved — "there", "changed", "gone" or "unknown" — and ' +
        'carries what the revision it was written against held in that field, when it named one. THIS HANDS BACK ' +
        'IDS AND NOT ADDRESSES: the browser owns its own routes, and a route table written on the server would ' +
        'be a second copy of them, free to go stale the first time a page moved. `interpretation` is null ' +
        'because nothing in Mole Office organises anybody\'s words yet. Writes nothing.',
    ),
    async (req): Promise<AnnotationView> => {
      const { id } = parse(annotationIdParams, req.params, 'The URL is not usable:')
      // A COMMENT THAT IS A MESSAGE carries its words here, so a reader who may not read the message is
      // refused, in the words an id naming nothing gets; and a comment left on such a message does not
      // quote its title. An annotation is not a message and is answered as before.
      return readAnnotation(id, workspaceOf(req), theMessageReader(actorFrom(req)))
    },
  )

  /**
   * The same reading for a whole list, in one request.
   *
   * A POST that writes nothing, because the list of ids is the input and a query string holding
   * forty of them is a URL nothing can be relied on to carry.
   */
  app.post(
    '/annotations/readings',
    route(
      'review.comments',
      'remote',
      'Whether each of these comments still holds, in ONE request. Takes {ids}. Answers one entry per id, in the ' +
        'order asked, each with "there", "changed" (the thing is there and the quoted words moved or went), ' +
        '"gone", or "unknown" when Mole Office cannot say either way — plus the words that were quoted and the `key` ' +
        'of the thing pointed at. AN ID THAT ANSWERS NOTHING IS REPORTED RATHER THAN LEFT OUT, and says which of ' +
        'no such record, another project, not a comment, or deleted it is: a shortened list tells a caller only ' +
        'that something went wrong. It is a POST because the input is a list and writes nothing at all. A ' +
        'reading is computed here and never stored, because a stored answer to "is this still there" is only ' +
        'ever right by accident.',
    ),
    async (req): Promise<AnnotationReadings> => {
      const body = parse(readingsBody, req.body, 'The request body is not usable:')
      // THE SAME RULE, for each comment asked about.
      return readAnnotations(body.ids, workspaceOf(req), theMessageReader(actorFrom(req)))
    },
  )
}
