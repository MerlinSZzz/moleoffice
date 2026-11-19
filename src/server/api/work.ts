// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `GET /api/work` — every piece of work in every project, at whatever level it sits.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The owner's loop ends in scheduling and doing, and its fifth step is a work list that is about the
 * person rather than about one project: one Home and one task list across every project, moving
 * between a goal, a pipeline or module, a task and a small operational item, and laying any part
 * of it out as a dense table. `design/ROUND-FOUR.md` sets out both.
 *
 * Until this route, `#/work` showed one project at a time and `GET /api/work` was a 404, so the step
 * had no answer at all. A browser that has never chosen a project opens on `default`, which holds no
 * records, so the product's answer to "what do I have to do" was an empty page.
 *
 * The reading is `src/server/lib/worklist.ts`. This file is the door: it adds nothing to the answer
 * and takes nothing away.
 *
 * ---------------------------------------------------------------------------------------
 * IT TAKES NO WORKSPACE HEADER, AND THAT IS THE SAME DECISION PLANNING TOOK
 * ---------------------------------------------------------------------------------------
 *
 * A workspace answers *which project owns this work*. This route answers *what have I got to do*,
 * and that is a fact about a person. `GET /api/needs-you` and the whole planning layer are already
 * person-level for exactly this reason, and the header of api/planning.ts argues it in full.
 *
 * It offers no filter, no search and no way to name one project, so it cannot be used to read a
 * project a caller could not otherwise read: it answers about all of them or not at all. Every row
 * says which project owns it. It writes nothing.
 *
 * ---------------------------------------------------------------------------------------
 * THE BY-ID BOUNDARY TEST, AND WHY THIS ROUTE IS NOT IN EITHER OF ITS TABLES
 * ---------------------------------------------------------------------------------------
 *
 * `tests/by-id-boundary.test.ts` walks the router, takes every route with a PARAMETER in its path,
 * and requires each one to be either exercised with a cross-project id or listed with a reason.
 * `/api/work` has no parameter — no id, no kind, no period — so it is outside that walk and needs no
 * entry. Nothing is being got out of the way: there is no id here for a caller to aim at another
 * project, because the route already answers about all of them and says so on every row.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  MAX_WORK_ROWS,
  WORK_KINDS_BECAUSE,
  WORK_ORDER,
  homeWorkList,
  readWorkList,
  workPageList,
  type WorkListReply,
  type WorkPageReply,
} from '../lib/worklist.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'

/**
 * HOW MUCH OF THE ANSWER COMES BACK.
 *
 * `home` is the home page's own reading: every row's state, its project and whether it has hours,
 * and the count the cap left out. The first band's standing count reads nothing else, and the whole
 * list is 702,267 bytes on a copy of the owner's database (12 September 2026). `page` is the Work to do
 * page's reading: every row without its title, its one line and `within`, which that page does not
 * draw. No shape is the whole list, deliberately: `#/plan` and `#/plans/<id>` draw those fields, and
 * `GET /api/work` without a shape still answers them. See `homeWorkList` and `workPageList` in
 * src/server/lib/worklist.ts for the field-by-field account.
 */
const workQuery = z.strictObject({
  shape: z
    .enum(['home', 'page'], {
      error:
        'shape must be "home" for the fields the home page draws, "page" for the rows the Work to do page draws, ' +
        'or left out for the whole list',
    })
    .optional(),
})

/**
 * The sentence GET /api serves for this endpoint.
 *
 * Built from the same three strings the reply itself carries, rather than written out again, so what
 * the index says this route does and what the route does cannot drift apart.
 */
export const WORK_NOTE =
  'What you have to do, across every project: GET /api/work. One row per piece of work, carrying its id, its ' +
  'kind, its title, the one line it was filed with, its state, the project that owns it, everything it is part ' +
  'of (outermost first, each with its own project, so a caller can draw it at its level or flatten the lot), ' +
  'how big it is in hours, and every allocation of hours it has already been given, by horizon and period. ' +
  'ITS ESTIMATE IS NULL WHEN NOBODY HAS SIZED IT, never zero — zero would mean somebody looked and said it ' +
  'takes no time. Hours at different horizons are never added here; the periods are listed and the adding is ' +
  "the reader's. A parent in another project is shown rather than hidden: links may not cross a project " +
  'boundary today, and rows written before that refusal existed are still stored. LIKE PLANNING AND ' +
  '/api/needs-you IT TAKES NO WORKSPACE HEADER, because what a person has to do is a fact about the person ' +
  'and not about one project — and it is not a way to read another project, because it offers no filter, no ' +
  'search and no way to name one: it answers about all of them or not at all. It writes nothing. ' +
  'A caller that draws only the standing count may ask `?shape=home`, which keeps each row\'s state, ' +
  'its project and the hours it has been given, and the count the cap left out, and drops every other ' +
  'field. A caller that draws rows by name may ask `?shape=page`, which leaves out each row\'s title, ' +
  'its one line and `within`. The whole list is what an unshaped request still answers. ' +
  `${WORK_KINDS_BECAUSE} ${WORK_ORDER} At most ${String(MAX_WORK_ROWS)} rows come back in one reply; when ` +
  'there are more, `leftOut` says how many are missing and `note` says so in words, so a cut list can never ' +
  'be mistaken for the whole of the work.'

export async function workRoutes(app: FastifyInstance): Promise<void> {
  app.get('/work', route('project.work', 'remote', WORK_NOTE),
    async (req): Promise<WorkListReply | WorkPageReply> => {
      const q = parse(workQuery, req.query, 'The query string is not usable:')
      const whole = readWorkList(MAX_WORK_ROWS)
      if (q.shape === 'home') return homeWorkList(whole)
      return q.shape === 'page' ? workPageList(whole) : whole
    })
}
