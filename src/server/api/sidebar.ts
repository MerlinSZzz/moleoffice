// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { gatePosition } from '../../config/settings.mjs'
import { movesBetween, problemsWithTheArrangement, type SidebarArrangement } from '@shared/sidebar-arrangement.ts'
import { sqlite } from '../db/client.ts'
import { actorFrom } from '../lib/http.ts'
import { writeDownASettingChange } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { theKeyProvesASecretary } from '../lib/the-key-proves-a-secretary.ts'
import { gateMet } from '../lib/gate-counts.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../lib/who-may-act.ts'
import { route } from '../lib/route.ts'
import { announce } from '../lib/events.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { loadSidebarArrangement, sidebarSetting, SIDEBAR_SETTING } from '../lib/sidebar.ts'

const preview = z.strictObject({ arrangement: z.unknown() })
const common = { version: z.string(), because: z.string().trim().min(1).max(500) }
const edit = z.strictObject({ ...common, arrangement: z.unknown() })
const restore = z.strictObject({ ...common, from: z.string().min(1) })
function refuse(reason: string, status = 400): never {
  throw new PanelError(reason + ' Nothing was changed.', status, undefined, undefined, undefined, { code: 'sidebarSettingRefused', values: { reason } })
}
export function sidebarHistory(offset = 0) {
  const rows = sqlite.prepare("SELECT id, at, actor_type, actor_id, old_value, new_value FROM changes WHERE record_id = 'setting:sidebar' ORDER BY rowid DESC LIMIT 11 OFFSET ?").all(offset) as { id: string; at: string; actor_type: string; actor_id: string; old_value: string; new_value: string }[]
  return {
    versions: rows.slice(0, 10).map(row => {
      const before = JSON.parse(row.old_value) as { arrangement: SidebarArrangement }
      const after = JSON.parse(row.new_value) as { arrangement: SidebarArrangement; because: string }
      return { id: row.id, at: row.at, by: { type: row.actor_type, id: row.actor_id }, because: after.because, before: before.arrangement, after: after.arrangement }
    }),
    next: rows.length > 10 ? offset + 10 : null,
  }
}
export async function sidebarRoutes(app: FastifyInstance): Promise<void> {
  loadSidebarArrangement()
  app.get('/sidebar', route('office.sidebar', 'remote', 'Read the office-wide sidebar arrangement, shipped groups, version and any stored arrangement this release cannot use.'), async () => sidebarSetting())
  app.post('/sidebar/preview', route('office.preview-sidebar', 'remote', 'Check a sidebar arrangement and describe its moves and reminders without writing. Any reader may preview.'), async req => {
    const parsed = preview.safeParse(req.body)
    if (!parsed.success) refuse('Send the sidebar arrangement to preview, with no extra fields.')
    const check = problemsWithTheArrangement(parsed.data.arrangement)
    return { ...check, moves: movesBetween(sidebarSetting().arrangement, parsed.data.arrangement) }
  })
  app.get('/sidebar/history', route('office.sidebar-history', 'remote', 'Read ten sidebar changes, newest first, with the complete arrangements, writer, time and reason.'), async req => {
    const parsed = z.strictObject({ offset: z.coerce.number().int().min(0).optional() }).safeParse(req.query)
    if (!parsed.success) refuse('Use a non-negative offset to read sidebar history.')
    return sidebarHistory(parsed.data.offset)
  })
  async function write(req: Parameters<typeof actorFrom>[0], restoring: boolean) {
    const actor = actorFrom(req)
    // At off the gate who-changes-the-page-words-and-sidebar lets any agent its own key proves through too, and counts it.
    if (!thePersonIsProved(actor) && actor.theOwnersAuthority?.holds !== true && !theKeyProvesASecretary(actor)) {
      const keyed = anAgentItsOwnKeyProves(actor) !== null
      if (!keyed && gatePosition('who-changes-the-page-words-and-sidebar') !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-changes-the-page-words-and-sidebar', 'change or put back the sidebar arrangement')
      if (!keyed || gateMet('who-changes-the-page-words-and-sidebar') === 'block') refuse('Only the owner or a secretary with its own key may change the sidebar arrangement.', 403)
    }
    const parsed = (restoring ? restore : edit).safeParse(req.body)
    if (!parsed.success) refuse('Send the sidebar version you read, a reason and the complete arrangement or the version to put back. Do not send extra fields.')
    const body = parsed.data, before = sidebarSetting()
    if (before.version !== body.version) refuse('The sidebar arrangement changed after you read it. Read it again before applying.', 409)
    let arrangement: unknown
    const shipped = 'from' in body && body.from === 'shipped'
    if ('from' in body) {
      if (shipped) arrangement = before.shipped
      else {
        const old = sqlite.prepare("SELECT new_value FROM changes WHERE id = ? AND record_id = 'setting:sidebar'").get(body.from) as { new_value: string } | undefined
        if (old === undefined) refuse('That change is not in the sidebar arrangement’s history.', 404)
        try { arrangement = JSON.parse(old.new_value).arrangement }
        catch { refuse('That change holds no readable sidebar arrangement.') }
      }
    } else arrangement = body.arrangement
    const check = problemsWithTheArrangement(arrangement)
    if (check.problems.length > 0) refuse(check.problems.join(' '))
    arrangement = { groups: (arrangement as SidebarArrangement).groups.map(group => ({ key: group.key, keys: [...group.keys] })) }
    // An explicit shipped restore also removes a refused stored row, even when the effective pages match.
    if (JSON.stringify(before.arrangement) === JSON.stringify(arrangement) && !(shipped && before.changed)) return { ...before, written: false }
    sqlite.transaction(() => {
      if (shipped) sqlite.prepare('DELETE FROM runtime_settings WHERE name = ?').run(SIDEBAR_SETTING)
      else sqlite.prepare('INSERT INTO runtime_settings (name,value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').run(SIDEBAR_SETTING, JSON.stringify(arrangement))
      writeDownASettingChange(actor, { setting: 'sidebar', field: 'sidebar arrangement', before: { arrangement: before.arrangement, ...(before.storedButNotUsed === null ? {} : { storedButNotUsed: before.storedButNotUsed.arrangement }) }, after: { arrangement, because: body.because }, workspaceId: workspaceOf(req) })
    })()
    loadSidebarArrangement()
    announce({ name: 'machine.changed', changed: ['settings'] })
    return { ...sidebarSetting(), written: true }
  }
  app.post('/sidebar', route('office.set-sidebar', 'remote', 'Apply the checked office-wide sidebar arrangement. Owner or secretary with its own key; while the gate who-changes-the-page-words-and-sidebar is off, any agent proved by its own key too, and it is counted; keep the complete change and its reason in one transaction.'), req => write(req, false))
  app.post('/sidebar/restore', route('office.restore-sidebar', 'remote', 'Put back the shipped sidebar or a change from its own history, with the same authority, version and arrangement checks.'), req => write(req, true))
}
export type SidebarHistory = ReturnType<typeof sidebarHistory>
