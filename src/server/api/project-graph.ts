// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT GRAPH, OVER HTTP. Wave 13s round 241.
 *
 *   GET /api/project-graph   the project's modules, pipelines and blocks, their past, the stopping points, and the
 *                            futures the product stores, in one bounded read
 *
 * The read is src/server/lib/project-graph.ts and the reply's shape is src/shared/project-graph.ts. What is here is the
 * door. It takes no query and has no write door.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { PROJECT_GRAPH_REVISION_ROWS, PROJECT_GRAPH_SCHEDULE_DAYS, type ProjectGraphReply } from '@shared/project-graph.ts'
import { parse } from '../lib/parse.ts'
import { readProjectGraph } from '../lib/project-graph.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'

export const PROJECT_GRAPH_NOTE =
  'One graph of this project, read fresh on every call and never stored: its live modules, pipelines and blocks with ' +
  'the module each is carried by, its stopping points with what they are about, its planned futures and directions ' +
  'with their planned states and what each is for, every stored link with an end among those records, a count of ' +
  `every revision of the project grouped by record and the newest ${String(PROJECT_GRAPH_REVISION_ROWS)} real ` +
  'revisions of the graph\'s own records, the plans with a line about one of them, and their work windows and ' +
  `allocations from today to ${String(PROJECT_GRAPH_SCHEDULE_DAYS)} days from today. The reply is ProjectGraphReply. ` +
  'Its says sentences name what the project does not hold and what was left out. No query is read, and a query ' +
  'word is refused. Nothing is written.'

const noQuery = z.strictObject({})

export async function projectGraphRoutes(app: FastifyInstance): Promise<void> {
  app.get('/project-graph', route('record.read', 'remote', PROJECT_GRAPH_NOTE), async (req): Promise<ProjectGraphReply> => {
    const workspaceId = workspaceOf(req)
    parse(noQuery, req.query, 'The query string')
    return readProjectGraph(workspaceId)
  })
}
