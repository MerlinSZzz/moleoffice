// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NEW OFFICE'S FIRST ENTRY. Wave 13y round 138, item 74.
 *
 *   GET  /api/getting-started          the first entry as the office keeps it, and whether the page draws it
 *   POST /api/getting-started/opened   the person opened its report from the checklist, so it ends
 *
 * The reader and the writer are in lib/getting-started.ts. Both halves are remote: the first entry belongs to the
 * office, and the person may open it on any machine the office is opened on. Only the person may end it.
 */
import type { FastifyInstance } from 'fastify'

import { actorFrom } from '../lib/http.ts'
import { endTheFirstEntry, theFirstEntry } from '../lib/getting-started.ts'
import { route } from '../lib/route.ts'
import type { TheFirstEntry } from '@shared/getting-started.ts'

const READ_NOTE =
  "A new office's first entry: the getting-started report the office filed when its person gave their name, the " +
  'checklist and standing item that hold it, and whether the page draws the first entry over the office. Read only, ' +
  'and no body is read. The reply is {state: "none" | "on" | "ended", report, checklist, item, shows, ended: {by, at} | ' +
  'null, says}. shows is true only while the entry is on, its report is held and its item is still open.'

const END_NOTE =
  'End the first entry: the page sends this when the person opens its report from the checklist. No body is read. ' +
  'Only the person may; an agent is refused with 403. With no first entry it is refused with 409. A first entry that ' +
  'already ended is left as it is, and the reply says changed: false. The reply is {changed, firstEntry}.'

export async function gettingStartedRoutes(app: FastifyInstance): Promise<void> {
  app.get('/getting-started', route('office.first-entry', 'remote', READ_NOTE), async (): Promise<TheFirstEntry> => theFirstEntry())

  app.post(
    '/getting-started/opened',
    route('office.end-first-entry', 'remote', END_NOTE),
    async (req): Promise<{ changed: boolean; firstEntry: TheFirstEntry }> => endTheFirstEntry(actorFrom(req)),
  )
}
