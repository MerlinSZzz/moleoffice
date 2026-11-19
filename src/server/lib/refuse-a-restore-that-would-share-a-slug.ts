// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `refuseARestoreThatWouldShareASlug` was moved byte for byte out of src/server/lib/toolset.ts, with no change of behaviour.
 * `said` was moved byte for byte out of src/server/lib/toolset.ts, with no change of behaviour.
 * `theOtherLiveToolWithSlug` was moved byte for byte out of src/server/lib/toolset.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { PanelError } from './panel-error.ts'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { records } from '../db/schema.ts'
import { TOOL_KIND } from '@shared/tool-kind.ts'

/**
 * A DELETED TOOL COMES BACK ONLY WHILE ITS SLUG IS FREE. Asked by `restoreRecord` in lib/records.ts
 * before it writes anything, because a tool filed while this one was deleted may have taken the slug,
 * and two live tools with one slug would leave GET /api/toolset/<slug> with two answers.
 *
 * Only the slug is asked. A restore brings the record back exactly as it was, so a category that was
 * deleted since is not a reason to refuse: the tool is then listed under `withoutACategory`, as a
 * live tool whose category was deleted is.
 */
export function refuseARestoreThatWouldShareASlug(tool: { id: string; title: string; workspaceId: string; data: unknown }): void {
  const slug = said(tool.data, 'slug')
  if (typeof slug !== 'string') return
  const other = theOtherLiveToolWithSlug(tool.workspaceId, slug, tool.id)
  if (other === null) return
  throw new PanelError(
    `The tool ${tool.id} ("${tool.title}") cannot be restored, because its slug "${slug}" is held by the live tool ` +
      `${other.id} ("${other.title}"). A slug is the address of one manual page, GET /api/toolset/${slug}, so two ` +
      `live tools cannot share one. Change the slug of ${other.id}, or delete it, and then restore ${tool.id}. ` +
      'Nothing was written.',
    409,
  )
}
/** An object's own key, or undefined. */
export function said(data: unknown, key: string): unknown {
  return data !== null && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>)[key] : undefined
}
/**
 * THE LIVE TOOL IN THIS PROJECT, OTHER THAN `mine`, THAT HOLDS THIS SLUG, or null because none does.
 * The one reading of "is this slug taken", asked by the create, the patch and the restore.
 *
 * READ LIVE, NOT REMEMBERED: two writes a moment apart must each see what the other stored.
 */
export function theOtherLiveToolWithSlug(workspaceId: string, slug: string, mine: string | null): { id: string; title: string } | null {
  for (const other of db
    .select({ id: records.id, title: records.title, data: records.data })
    .from(records)
    .where(and(eq(records.workspaceId, workspaceId), eq(records.kind, TOOL_KIND), isNull(records.deletedAt)))
    .all()) {
    if (other.id === mine) continue
    if (said(other.data, 'slug') !== slug) continue
    return { id: other.id, title: other.title }
  }
  return null
}
