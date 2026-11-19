// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { homeLayoutSettingName, problemsWithTheHomeLayout, type HomeLayout } from '@shared/home-layout.ts'
import { sqlite } from '../db/client.ts'
import { actorFrom } from '../lib/http.ts'
import { PanelError, thePersonIsProved, writeDownASettingChange } from '../lib/records.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { keptHomeLayout, theKeptHomeLayoutRow, theLayoutInTheRow } from '../lib/home-layout.ts'

const keep = z.strictObject({ layout: z.unknown() })
function refuse(reason: string, status = 400): never {
  throw new PanelError(reason + ' Nothing was changed.', status, undefined, undefined, undefined, { code: 'homeLayoutRefused', values: { reason } })
}

/**
 * EACH PERSON'S HOME LAYOUT, ONE ROW EACH. The row is named for the person who asks, so nobody reads or writes another
 * person's layout here. Only the person writes their own: an agent is refused, and a raise does not carry it. A write
 * is not announced, because the layout is one person's own and Home reads it itself: once in a page load, and again
 * after the person's own move.
 */
export async function homeLayoutRoutes(app: FastifyInstance): Promise<void> {
  app.get('/home-layout', route('office.home-layout', 'remote', 'Read the Home layout kept for the person asking: A when nothing is kept, and A with the reasons when the kept one cannot be read.'), async req => keptHomeLayout(actorFrom(req).id))
  app.put('/home-layout', route('office.set-home-layout', 'remote', 'Keep a checked Home layout for the person asking, and write the change down with it. Only the person writes their own; an agent is refused.'), async req => {
    const actor = actorFrom(req)
    if (!thePersonIsProved(actor)) refuse('Only a person keeps their own Home layout. An agent may not write it.', 403)
    const parsed = keep.safeParse(req.body)
    if (!parsed.success) refuse('Send the Home layout to keep, and nothing else.')
    const problems = problemsWithTheHomeLayout(parsed.data.layout)
    if (problems.length > 0) refuse(problems.join(' '))
    const sent = parsed.data.layout as HomeLayout
    const layout: HomeLayout = { band: [...sent.band], first: [...sent.first], second: [...sent.second] }
    const row = theKeptHomeLayoutRow(actor.id), before = theLayoutInTheRow(row)
    if (before.kept === 'kept' && JSON.stringify(before.layout) === JSON.stringify(layout)) return { layout, written: false }
    const name = homeLayoutSettingName(actor.id)
    // A row Home could not read is written down whole, so the write loses nothing of it.
    const was = { layout: before.layout, kept: before.kept, ...(before.kept === 'unreadable' ? { unreadableRow: row } : {}) }
    sqlite.transaction(() => {
      sqlite.prepare('INSERT INTO runtime_settings (name,value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').run(name, JSON.stringify(layout))
      writeDownASettingChange(actor, { setting: name, field: 'Home layout', before: was, after: { layout }, workspaceId: workspaceOf(req) })
    })()
    return { layout, written: true }
  })
}
