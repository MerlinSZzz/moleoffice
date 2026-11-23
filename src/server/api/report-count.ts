// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { reportsCountSettingName } from '@shared/report-count.ts'
import { sqlite } from '../db/client.ts'
import { actorFrom } from '../lib/http.ts'
import { PanelError, thePersonIsProved, writeDownASettingChange } from '../lib/records.ts'
import { keptReportsCount } from '../lib/report-count.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'

const keep = z.strictObject({ shown: z.boolean() })
function refuse(reason: string, status = 400): never {
  throw new PanelError(reason + ' Nothing was changed.', status, undefined, undefined, undefined, { code: 'reportCountRefused', values: { reason } })
}

/**
 * EACH PERSON'S ANSWER ABOUT THE NUMBER OF UNREAD REPORTS, ONE ROW EACH. The row is named for the person who asks,
 * so nobody reads or writes another person's answer. Only the person writes their own: an agent is refused, and a
 * raise does not carry it. With nothing kept the number is hidden.
 */
export async function reportCountRoutes(app: FastifyInstance): Promise<void> {
  app.get('/report-count', route('office.report-count', 'remote', 'Read whether the person asking sees how many reports are unread: hidden when nothing is kept.'), async req => keptReportsCount(actorFrom(req).id))
  app.put('/report-count', route('office.set-report-count', 'remote', 'Keep whether the person asking sees how many reports are unread, and write the change down with it. Only the person writes their own; an agent is refused.'), async req => {
    const actor = actorFrom(req)
    if (!thePersonIsProved(actor)) refuse('Only a person chooses whether they see how many reports are unread. An agent may not write it.', 403)
    const parsed = keep.safeParse(req.body)
    if (!parsed.success) refuse('Send whether the count is shown, as true or false, and nothing else.')
    const shown = parsed.data.shown
    const before = keptReportsCount(actor.id).shown
    if (before === shown) return { shown, written: false }
    const name = reportsCountSettingName(actor.id)
    sqlite.transaction(() => {
      sqlite.prepare('INSERT INTO runtime_settings (name,value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').run(name, JSON.stringify(shown))
      writeDownASettingChange(actor, { setting: name, field: 'Whether the number of unread reports is shown', before: { shown: before }, after: { shown }, workspaceId: workspaceOf(req) })
    })()
    return { shown, written: true }
  })
}
