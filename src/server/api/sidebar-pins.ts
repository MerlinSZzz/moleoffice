// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { problemsWithThePins, sidebarPinsSettingName } from '@shared/sidebar-pins.ts'
import { sqlite } from '../db/client.ts'
import { actorFrom } from '../lib/http.ts'
import { PanelError, thePersonIsProved, writeDownASettingChange } from '../lib/records.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { keptSidebarPins, theKeptPinsRow, thePinsInTheRow } from '../lib/sidebar-pins.ts'

const keep = z.strictObject({ pins: z.unknown() })
function refuse(reason: string, status = 400): never {
  throw new PanelError(reason + ' Nothing was changed.', status, undefined, undefined, undefined, { code: 'sidebarPinsRefused', values: { reason } })
}

/**
 * EACH PERSON'S PAGES IN FRONT OF THE SIDEBAR, ONE ROW EACH, kept as Home's layout is kept. The row is named for the
 * person who asks, so nobody reads or writes another person's pins here. Only the person writes their own: an agent
 * is refused, and a raise does not carry it. The office-wide arrangement of All pages' groups is a separate setting
 * with its own door, and a pin does not change it.
 */
export async function sidebarPinsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/sidebar-pins', route('office.sidebar-pins', 'remote', 'Read the pages in front of the sidebar kept for the person asking: the shipped four when nothing is kept, and those four with the reasons when the kept ones cannot be read.'), async req => keptSidebarPins(actorFrom(req).id))
  app.put('/sidebar-pins', route('office.set-sidebar-pins', 'remote', 'Keep a checked list of pages in front of the sidebar for the person asking, and write the change down with it. Only the person writes their own; an agent is refused.'), async req => {
    const actor = actorFrom(req)
    if (!thePersonIsProved(actor)) refuse('Only a person keeps their own pages in front of the sidebar. An agent may not write them.', 403)
    const parsed = keep.safeParse(req.body)
    if (!parsed.success) refuse('Send the pages in front to keep, and nothing else.')
    const problems = problemsWithThePins(parsed.data.pins)
    if (problems.length > 0) refuse(problems.join(' '))
    const pins = [...(parsed.data.pins as string[])]
    const row = theKeptPinsRow(actor.id), before = thePinsInTheRow(row)
    if (before.kept === 'kept' && JSON.stringify(before.pins) === JSON.stringify(pins)) return { pins, written: false }
    const name = sidebarPinsSettingName(actor.id)
    // A row the sidebar could not read is written down whole, so the write loses nothing of it.
    const was = { pins: before.pins, kept: before.kept, ...(before.kept === 'unreadable' ? { unreadableRow: row } : {}) }
    sqlite.transaction(() => {
      sqlite.prepare('INSERT INTO runtime_settings (name,value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').run(name, JSON.stringify(pins))
      writeDownASettingChange(actor, { setting: name, field: 'Pages in front of the sidebar', before: was, after: { pins }, workspaceId: workspaceOf(req) })
    })()
    return { pins, written: true }
  })
}
