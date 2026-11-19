// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PACKAGE'S WORKERS, AND A DAY'S PACKAGES. Round FQ, point OP-3.
 *
 * TWO READ-ONLY DOORS. `GET /api/delegation/<task>/workers` is one package's list, and
 * `GET /api/delegation/workers?day=YYYY-MM-DD` is the same lists for every package asked for work on a day, in pages
 * of at most 25. Both are readings of the records, worked out fresh by src/server/lib/package-workers.ts; neither
 * writes anything, and neither counts a missing receipt as zero.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { recordInWorkspace } from '../lib/records.ts'
import { packageOf } from '../lib/delegation.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { theMessageReader } from '../lib/messages.ts'
import { isADay, thePackagesOfADay, theWorkersOfAPackage } from '../lib/package-workers.ts'

const PACKAGE_NOTE =
  "ONE PACKAGE'S WORKERS, oldest ask first: for each worker, its name and handle, the ask's state, the worker run's own " +
  'state, the model, the points it was given, the difficulty and why, its tokens, its minutes and how many of the ' +
  "package's hand-backs name its run. Tokens are the run's own usage receipt, added by the office's one summation; a " +
  'run without a receipt says its tokens were not read and is never counted as zero. Minutes are the office\'s own ' +
  'start and end of the run, and a running run says they are not complete. The hand-backs that name no worker are ' +
  'counted beside the list rather than dropped. A worker asked for whose run was never filed is listed too. Writes ' +
  'nothing.'

const DAY_NOTE =
  'EVERY PACKAGE ASKED FOR WORK ON ONE DAY, newest ask first, in pages of at most 25: {"day": "YYYY-MM-DD", "page": 1, ' +
  '"size": 25}. Each row is exactly what GET /api/delegation/<task>/workers gives that package, with the first ask on ' +
  "that day beside it. A package asked on two days is on both. A day is a local day, and a day that is not " +
  'YYYY-MM-DD, or a size above 25, is refused in words. Writes nothing.'

const dayQuery = z
  .object({
    day: z.string(),
    page: z.coerce.number().int().min(1).default(1),
    size: z.coerce.number().int().min(1).max(25).default(25),
  })
  .strict()

export async function packageWorkerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/delegation/workers', route('delegation.workersDay', 'remote', DAY_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const query = parse(dayQuery, req.query ?? {}, 'The day’s packages cannot be read:')
    if (!isADay(query.day)) {
      throw new PanelError(`"${query.day}" is not a day, so no package can be read for it. Name it as YYYY-MM-DD, such as 2026-11-17. Nothing was read.`, 400)
    }
    return thePackagesOfADay(query.day, query.page, query.size, workspaceId)
  })

  app.get<{ Params: { recordId: string } }>('/delegation/:recordId/workers', route('delegation.workers', 'remote', PACKAGE_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const task = recordInWorkspace(req.params.recordId, workspaceId, theMessageReader(actorFrom(req)))
    if (task.kind !== 'task') {
      throw new PanelError(`"${task.title}" is not a task, and only a task holds a package with workers. Nothing was read.`, 400)
    }
    if (packageOf(task.data) === null) {
      throw new PanelError(`"${task.title}" has not been packaged, so it has no workers to list. Nothing was read.`, 409)
    }
    return theWorkersOfAPackage(task)
  })
}
