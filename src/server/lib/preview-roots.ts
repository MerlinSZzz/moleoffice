// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DIRECTORIES SOMEBODY ADDED BY HAND AS PREVIEW ROOTS, AND THE ONE READER THAT TELLS TWO ABSENCES APART.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion U4 as it now reads: the directories a preview may read are
 * derived, and a press on the Settings page adds one by hand for the odd case, recorded with who and
 * when. The derived half is in src/server/api/files.ts. This is the store for the hand-added half:
 * one singleton row in the shape `office_scene_settings` uses, its JSON keyed by workspace id.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO ABSENCES, WHICH READ THE SAME AND ARE NOT
 * ---------------------------------------------------------------------------------------
 *
 * Nobody has ever added one, and somebody has added one but not in this project. A reader that
 * returned an empty list for both would let a screen say "nothing here" about a person's press that
 * exists a project over. So `chosen` says whether the row exists at all and `additions` says what
 * this project holds; the panel reads both and can say which absence it is.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT FOLLOWS src/server/lib/pixel-office.ts EXACTLY
 * ---------------------------------------------------------------------------------------
 *
 * Same shape, same one-reader/one-writer split, same strict schema with a version literal, same
 * insert-or-replace. That is the pattern this piece was ruled to follow, and following it is
 * why this needs no new kind of thing.
 */
import { existsSync, statSync } from 'node:fs'
import { isAbsolute, resolve as resolvePath } from 'node:path'
import { z } from 'zod'
import { sqlite } from '../db/client.ts'
import { nowStamp } from '@shared/time.ts'
import { type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'

/** One directory somebody added by hand, with who added it and when. */
export const addedPreviewRootSchema = z.strictObject({
  path: z.string().min(1),
  addedBy: z.string().min(1),
  addedAt: z.string().min(1),
  why: z.string(),
})

/** The whole stored object: a version, and a list of additions per project. */
export const addedPreviewRootsSchema = z.strictObject({
  version: z.literal(1),
  byWorkspace: z.record(z.string(), z.array(addedPreviewRootSchema)),
})

export type AddedPreviewRoot = z.infer<typeof addedPreviewRootSchema>
export type AddedPreviewRoots = z.infer<typeof addedPreviewRootsSchema>

/** What one project's hand-added list answers, and whether the row exists at all. */
export interface AddedPreviewRootsReading {
  /** The directories somebody added by hand in this project, in the order they were added. */
  additions: AddedPreviewRoot[]
  /**
   * True when a row exists: somebody has added one somewhere. False means nobody ever has. An empty
   * `additions` with `chosen: true` is "nobody added one IN THIS PROJECT", not "nobody ever added
   * one" — two different facts a screen has to be able to tell apart.
   */
  chosen: boolean
  /** When the row was last written, or null when there is no row. */
  updatedAt: string | null
  /** Who last wrote it, or null when there is no row. */
  updatedBy: { kind: string; id: string } | null
}

/** The stored object, or the empty version-1 object when nobody has added one. */
export function readAddedPreviewRoots(): AddedPreviewRoots {
  const held = sqlite.prepare('SELECT settings FROM preview_root_additions WHERE only_row = 1').get() as
    | { settings: string }
    | undefined
  if (held === undefined) return { version: 1, byWorkspace: {} }
  return addedPreviewRootsSchema.parse(JSON.parse(held.settings))
}

/** The directories this project's row holds, or an empty list. Not the same as `chosen`. */
export function addedPreviewRootsFor(workspaceId: string): AddedPreviewRoot[] {
  return readAddedPreviewRoots().byWorkspace[workspaceId] ?? []
}

/** What one project holds, and whether anybody has ever added one anywhere. */
export function addedPreviewRootsReading(workspaceId: string): AddedPreviewRootsReading {
  const held = sqlite
    .prepare('SELECT settings, updated_at, updated_by_kind, updated_by_id FROM preview_root_additions WHERE only_row = 1')
    .get() as { settings: string; updated_at: string; updated_by_kind: string; updated_by_id: string } | undefined
  if (held === undefined) return { additions: [], chosen: false, updatedAt: null, updatedBy: null }
  const settings = addedPreviewRootsSchema.parse(JSON.parse(held.settings))
  return {
    additions: settings.byWorkspace[workspaceId] ?? [],
    chosen: true,
    updatedAt: String(held.updated_at),
    updatedBy: { kind: String(held.updated_by_kind), id: String(held.updated_by_id) },
  }
}

/**
 * Add one directory by hand for one project, recorded with who and when.
 *
 * THE DIRECTORY HAS TO EXIST AND BE A DIRECTORY, refused before anything is written. The alternative
 * — store it and let the derivation drop it for being absent — would take the person's press and
 * answer a list that does not contain what they just added, with nothing saying why. A path is
 * stored ABSOLUTE and resolved, so the list and the fence cannot come to different spellings of it.
 */
export function addPreviewRoot(input: { path: string; why: string }, workspaceId: string, actor: Actor): AddedPreviewRootsReading {
  const raw = input.path.trim()
  if (raw === '') {
    throw new PanelError('A directory path is needed. Nothing was written.', 400)
  }
  if (!isAbsolute(raw)) {
    throw new PanelError(
      `"${raw}" is not an absolute path. A preview root is a directory on this machine, written in full, so a ` +
        'relative one would mean a different directory depending on where the server was started. Nothing was written.',
      400,
    )
  }
  const resolved = resolvePath(raw)
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new PanelError(
      `"${raw}" is not a directory on this machine, so it cannot be a directory a preview reads. Nothing was written.`,
      400,
    )
  }
  const why = input.why.trim()
  if (why === '') {
    throw new PanelError('Say why this directory should be readable. Nothing was written.', 400)
  }

  const current = readAddedPreviewRoots()
  const list = current.byWorkspace[workspaceId] ?? []
  if (list.some((one) => resolvePath(one.path) === resolved)) {
    throw new PanelError(`"${resolved}" is already added as a directory a preview may read in this project. Nothing was written.`, 409)
  }

  const at = nowStamp()
  const next: AddedPreviewRoots = {
    version: 1,
    byWorkspace: { ...current.byWorkspace, [workspaceId]: [...list, { path: resolved, addedBy: `${actor.type}:${actor.id}`, addedAt: at, why }] },
  }
  const authority = actor.theOwnersAuthority?.holds === true ? actor.theOwnersAuthority.because : null
  sqlite
    .prepare(
      'INSERT INTO preview_root_additions (only_row, settings, updated_at, updated_by_kind, updated_by_id, authority) ' +
        'VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(only_row) DO UPDATE SET settings=excluded.settings, ' +
        'updated_at=excluded.updated_at, updated_by_kind=excluded.updated_by_kind, updated_by_id=excluded.updated_by_id, ' +
        'authority=excluded.authority',
    )
    .run(JSON.stringify(next), at, actor.type, actor.id, authority)
  return addedPreviewRootsReading(workspaceId)
}
