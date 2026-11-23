// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PIPELINES THAT STAND STILL, OVER HTTP. Wave 13s round 281, point HD-2e of home as a data dashboard.
 *
 *   GET /api/pipelines/standing-still   the project's pipelines whose every step that is not done is paused
 *
 * The statement is src/server/lib/pipelines-standing-still.ts and the shape src/shared/pipelines-standing-still.ts.
 * What is here is the door. It answers for the request's project. It takes no query word, so a word such as
 * `?projects=` is refused with 400 rather than read as the one project. Nothing is written.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { parse } from '../lib/parse.ts'
import { thePipelinesStandingStill } from '../lib/pipelines-standing-still.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'

const STANDING_STILL_NOTE =
  'THE PIPELINES THAT STAND STILL. The project\'s pipelines that have a step not done and whose every step not done is ' +
  'paused, as Home\'s Late or stuck draws them: at most as many as it draws, newest first and then by id, each with its ' +
  'id, title, project and how many steps are not done, and `total`, how many stand still in all. Takes no query word. ' +
  'Writes nothing.'

const NO_WORD = z.strictObject({})

export async function pipelinesStandingStillRoutes(app: FastifyInstance): Promise<void> {
  app.get('/pipelines/standing-still', route('pipeline.standing-still', 'remote', STANDING_STILL_NOTE), async (req) => {
    parse(NO_WORD, req.query ?? {}, 'The query string')
    return thePipelinesStandingStill(workspaceOf(req))
  })
}
