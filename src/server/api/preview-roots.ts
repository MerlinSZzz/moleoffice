// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DOOR THAT ANSWERS THE DIRECTORIES A PREVIEW MAY READ, FOR ONE PROJECT, AND THE PRESS THAT ADDS ONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion U4: the directories a preview may read are
 * not a setting anybody types. They are derived from the project's registered repositories and work
 * areas, and the Settings page shows the list per project with where each entry came from. Until
 * this route there was no door that answered that list: `previewRoots()` was reached only by the
 * preview itself and by the message-picture upload, so the page could not draw what was in force.
 *
 * ---------------------------------------------------------------------------------------
 * ONE READ AND ONE PRESS
 * ---------------------------------------------------------------------------------------
 *
 * The whole derivation lives in src/server/api/files.ts, in one function, so this route cannot come
 * to a different answer than the refusal a preview gives. The list is read fresh on every request —
 * no caching — for the reason files.ts states: a remembered yes would outlive the registration that
 * justified it.
 *
 * The press is for the odd case: a directory that is nobody's registered repository and is named by
 * no work area. It is recorded with who added it and when, in src/server/lib/preview-roots.ts, and
 * it is KEPT ON THIS MACHINE because it names a folder on this computer. The store's own reader
 * distinguishes "nobody has ever added one" from "somebody has, but not in this project", and the
 * reply carries that distinction so the panel can say which absence it is showing.
 *
 * THE REPLY NEEDS NO EXISTENCE CHECK ON THE WORKSPACE, because `workspaceOf` is the same pair every
 * other route uses: an unknown project is the standard 404 that lists the ones that exist.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { PreviewRootReading } from '@shared/preview-roots.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { addPreviewRoot, addedPreviewRootsReading, type AddedPreviewRootsReading } from '../lib/preview-roots.ts'
import { previewRoots } from './files.ts'

/** What GET and POST /api/preview-roots answer: the roots in force, and the hand-added record. */
export interface PreviewRootsReply {
  /** The project this list was derived for, which is the one the request named. */
  workspaceId: string
  /** The directories a preview may read here, each carrying where it came from. */
  roots: PreviewRootReading[]
  /** What somebody added by hand in this project, with who and when, and whether any exists at all. */
  added: AddedPreviewRootsReading
  /** What the list means, in one sentence, for a page that has room for it and nothing else. */
  says: string
}

const PREVIEW_ROOTS_NOTE =
  'The directories a preview may read in the project you are asking in, and where each one came from. Read only: ' +
  'it changes nothing. The list is derived per project — the checkout, ~/.cache/mole-office, the root of every ' +
  'repository registered here, and every existing directory a registered work area names under one of those roots — ' +
  'and it is added BESIDE MOLE_OFFICE_PREVIEW_ROOTS, never in place of it. `source` on each entry says which of ' +
  'those it is. It is the same list GET /api/file checks, so what this answers and what the refusal says cannot ' +
  'disagree.'

const ADD_NOTE =
  'Add one directory on this computer to the directories a preview may read in this project, for the odd case that ' +
  'is nobody\'s registered repository and is named by no work area. It is recorded with who added it and when. The ' +
  'directory must exist. This is kept on this machine because it names a folder on this computer, and it is added ' +
  'BESIDE MOLE_OFFICE_PREVIEW_ROOTS rather than replacing anything. The reply is the whole updated list.'

const addBody = z.strictObject({
  path: z.string().min(1, { error: 'path is the absolute path of a directory on this machine' }),
  why: z.string().min(1, { error: 'why says what this directory is for; it is recorded beside who added it and when' }),
})

function readingFor(workspaceId: string): PreviewRootsReply {
  const roots = previewRoots(workspaceId).map((root) => ({
    path: root.configured,
    canonical: root.canonical,
    source: root.source,
  }))
  return {
    workspaceId,
    roots,
    added: addedPreviewRootsReading(workspaceId),
    says:
      roots.length === 0
        ? 'No directory is in force in this project, so no file can be previewed here until the setting names one.'
        : `${String(roots.length)} director${roots.length === 1 ? 'y is' : 'ies are'} in force in this project.`,
  }
}

export async function previewRootRoutes(app: FastifyInstance): Promise<void> {
  app.get('/preview-roots', route('preview.roots.read', 'remote', PREVIEW_ROOTS_NOTE), async (req): Promise<PreviewRootsReply> => {
    return readingFor(workspaceOf(req))
  })

  app.post(
    '/preview-roots',
    route(
      'preview.roots.change',
      'local',
      { because: 'acts-on-this-machine', act: 'Adding a folder on this computer to the directories a preview may read' },
      ADD_NOTE,
    ),
    async (req): Promise<PreviewRootsReply> => {
      const workspaceId = workspaceOf(req)
      const body = parse(addBody, req.body, 'The directory to add')
      addPreviewRoot(body, workspaceId, actorFrom(req))
      return readingFor(workspaceId)
    },
  )
}
