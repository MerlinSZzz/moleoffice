// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEY ITEMS OF A PROJECT: TWO READ DOORS AND FIVE WRITE DOORS. Wave 13s round 281, point HD-2c of home as a data
 * dashboard.
 *
 *   GET   /api/key-items              the open key items of this project in their order, or of every project, or the
 *                                     closed ones                                                  (anyone who may read)
 *   POST  /api/key-items              adds one                                       (the person, or a secretary as itself)
 *   GET   /api/key-items/:id          one key item and each estimate it has carried                (anyone who may read)
 *   PATCH /api/key-items/:id          changes its title, packages, progress or estimate (the person, or a secretary as itself)
 *   POST  /api/key-items/:id/place    moves it in the order                          (the person, or a secretary as itself)
 *   POST  /api/key-items/:id/close    closes it                                      (the person, or a secretary as itself)
 *   POST  /api/key-items/:id/reopen   opens it again, at the end of the order        (the person, or a secretary as itself)
 *
 * src/server/lib/key-items.ts checks the writer, reads the body and writes; this file only hands each request on. The
 * kind is src/shared/kinds/key-item.ts, and the read shapes src/shared/key-items.ts.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import {
  HOURS_IN_A_DAY,
  HOURS_LEFT_AT_MOST,
  PACKAGES_OF_A_KEY_ITEM_AT_MOST,
  WHO_MAY_WRITE_A_KEY_ITEM,
  type AKeyItemWritten,
  type OneKeyItem,
  type TheKeyItems,
} from '@shared/key-items.ts'
import { actorFrom } from '../lib/http.ts'
import {
  changeAKeyItem,
  closeAKeyItem,
  ESTIMATE_REVISIONS_READ,
  fileAKeyItem,
  moveAKeyItem,
  oneKeyItem,
  reopenAKeyItem,
  theKeyItemAt,
  theKeyItems,
} from '../lib/key-items.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'

const AN_ITEM =
  'Each key item gives id, title, project {id, title}, state, place (its place in the order of its project\'s open ' +
  'key items, 1 first, null when closed), packages, progress and estimate. progress says where it came from: from ' +
  '"packages" counts the points done of all the points of the packages it names (done, of, percent, and each package ' +
  'with its own count, or why it was not counted); from "set" is a whole percent somebody set, with setBy and setAt; ' +
  'from "not-set" means nobody set one. estimate is an estimate of the time left and never a recorded fact: state ' +
  `"estimated" gives hoursLeft, the same as days of ${String(HOURS_IN_A_DAY)} hours and hours, estimatedBy and ` +
  'estimatedAt; state "not-estimated" means nobody made one.'

const LIST_NOTE =
  'Lists the key items of this project: the things it keeps in front of the person, with their progress and an ' +
  'estimate of the time left. The open ones come in their order. ?projects=every lists the key items of every project ' +
  'together, project by project; ?state=closed lists the closed ones instead, last closed first. ' +
  `${AN_ITEM} Only key items and the packages they name are read.`

const ONE_NOTE =
  `Reads one key item of this project, by its record id: item as the list gives it, and estimates, each estimate it ` +
  `has carried, newest first, with seq, hoursLeft, estimatedBy and estimatedAt, read from its last ` +
  `${String(ESTIMATE_REVISIONS_READ)} revisions; revisionsNotRead counts the older ones left out. A record of another ` +
  'kind is a 400, and a deleted one a 404.'

const WRITES =
  `${WHO_MAY_WRITE_A_KEY_ITEM} Every other caller is refused, and POST and PATCH /api/records refuse the kind to ` +
  'everybody. The office writes who set a progress or made an estimate, and when; a body that sends them is refused. ' +
  'The reply is what GET /api/key-items/<id> answers, with written (what the write did) and the record.'

const CREATE_NOTE =
  'Adds a key item to this project. Body {"title": one line, "packages"?: the ids of tasks of this project that ' +
  `each hold a package with points, at most ${String(PACKAGES_OF_A_KEY_ITEM_AT_MOST)}, "progress"?: a whole percent, ` +
  'only when it names no package, "hoursLeft"?: the time left as an estimate in whole hours from 0 to ' +
  `${String(HOURS_LEFT_AT_MOST)}, "place"?: its place in the order, at the end when left out}. ${WRITES}`

const CHANGE_NOTE =
  'Changes a key item\'s title, packages, set progress or estimate. Body {"title"?, "packages"?, "progress"?, ' +
  '"hoursLeft"?}, at least one; null clears packages, a progress or an estimate. A progress is refused beside ' +
  'packages, which count it already. Sending hoursLeft makes a new estimate, written with who made it and when, and ' +
  `the earlier one stays in the key item's history. ${WRITES}`

const PLACE_NOTE =
  'Moves an open key item to another place in the order of its project\'s open key items. Body {"place": 1 for ' +
  `first}; the ones between move by one. A closed key item has no place. ${WRITES}`

const CLOSE_NOTE =
  'Closes a key item. It leaves the open list and the order, and the ones after it move up by one. Closing a closed ' +
  `one writes nothing. ${WRITES}`

const REOPEN_NOTE =
  'Opens a closed key item again, at the end of the order of its project\'s open key items. Opening an open one ' +
  `writes nothing. ${WRITES}`

/** The list door's query. */
const listQuery = z.strictObject({
  projects: z.enum(['this', 'every']).optional(),
  state: z.enum(['open', 'closed']).optional(),
})

const theId = (req: FastifyRequest): string => (req.params as { id: string }).id

export async function keyItemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/key-items', route('key-items.list', 'remote', LIST_NOTE), async (req): Promise<TheKeyItems> => {
    const query = parse(listQuery, req.query ?? {}, 'The key items asked for:')
    return theKeyItems(workspaceOf(req), { projects: query.projects ?? 'this', state: query.state ?? 'open' })
  })

  app.post('/key-items', route('key-items.create', 'remote', CREATE_NOTE), async (req, reply): Promise<AKeyItemWritten> => {
    const written = fileAKeyItem(req.body, workspaceOf(req), actorFrom(req))
    void reply.code(201)
    return written
  })

  app.get('/key-items/:id', route('key-items.one', 'remote', ONE_NOTE), async (req): Promise<OneKeyItem> => {
    return oneKeyItem(theKeyItemAt(theId(req), workspaceOf(req)).id)
  })

  app.patch('/key-items/:id', route('key-items.change', 'remote', CHANGE_NOTE), async (req): Promise<AKeyItemWritten> => {
    return changeAKeyItem(theId(req), req.body, workspaceOf(req), actorFrom(req))
  })

  app.post('/key-items/:id/place', route('key-items.place', 'remote', PLACE_NOTE), async (req): Promise<AKeyItemWritten> => {
    return moveAKeyItem(theId(req), req.body, workspaceOf(req), actorFrom(req))
  })

  app.post('/key-items/:id/close', route('key-items.close', 'remote', CLOSE_NOTE), async (req): Promise<AKeyItemWritten> => {
    return closeAKeyItem(theId(req), req.body, workspaceOf(req), actorFrom(req))
  })

  app.post('/key-items/:id/reopen', route('key-items.reopen', 'remote', REOPEN_NOTE), async (req): Promise<AKeyItemWritten> => {
    return reopenAKeyItem(theId(req), req.body, workspaceOf(req), actorFrom(req))
  })
}
