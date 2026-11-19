// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY PROJECT, READ ONCE FOR THE WHOLE BROWSER however many components ask for it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS HERE AND NOT WHERE IT WAS
 * ---------------------------------------------------------------------------------------
 *
 * This was `PROJECTS` and `useProjects` inside src/web/components/plans/planitems.tsx, written for
 * the Project cell of a plan row: forty rows all wanting the list, one request between them. It
 * moved because a second caller appeared that planitems.tsx cannot serve — `ErrorNote` in
 * components/ui.tsx, which has to name the project a record is really in when somebody opens a link
 * to a record in another project. planitems.tsx imports ui.tsx, so ui.tsx importing planitems.tsx
 * would be a cycle.
 *
 * IT IS A MOVE AND NOT A COPY. planitems.tsx re-exports `useProjects` from here, so every caller it
 * had goes on working and there is still one request, one cache and one idea of what the projects
 * are. Two caches would be this repository's recurring defect — the same fact worked out twice,
 * free to disagree, with nothing failing when they do.
 *
 * WHY IT IS NOT IN lib/projects.ts. That file's docstring states, as its reason for existing, that
 * it imports nothing at all — so a plain Node test can read `projectName` without a `window`. This
 * one needs React and the HTTP client, and putting it there would take that property away.
 *
 * NULL MEANS NOBODY HAS FINISHED READING THEM. It does not mean there are none. A caller draws what
 * it can without the list rather than inventing one from the ids it happens to hold.
 */
import { useEffect, useState } from 'react'
import { projectName } from './projects.ts'
import { readWorkspacesOnce } from './oneread.ts'
import type { WorkspacesReply } from '../../server/api/workspaces.ts'

export type ProjectRow = WorkspacesReply['workspaces'][number]

const PROJECTS: { rows: readonly ProjectRow[] | null; asked: boolean; watchers: Set<() => void> } = {
  rows: null,
  asked: false,
  watchers: new Set(),
}

function askForProjects(): void {
  if (PROJECTS.asked) return
  PROJECTS.asked = true
  // THE SAME READ THE FRAME AND HOME USE (src/web/lib/oneread.ts), so this cache and those callers
  // are one request and not two. It joins a read already in flight and returns one already made.
  readWorkspacesOnce().then(
    (reply) => {
      PROJECTS.rows = reply.workspaces
      for (const on of PROJECTS.watchers) on()
    },
    () => {
      // THE LIST STAYS NULL AND EVERY CALLER GOES ON DRAWING WHAT IT ALREADY KNOWS. A row of error
      // text in forty cells would say the same thing forty times about one failed request, and each
      // caller has an answer without it. `asked` stays true so a broken server is asked once.
    },
  )
}

/** Every project, or null while nobody has finished reading them. One request for the whole page. */
export function useProjects(): readonly ProjectRow[] | null {
  const [, redraw] = useState(0)
  useEffect(() => {
    const on = () => redraw((n) => n + 1)
    PROJECTS.watchers.add(on)
    askForProjects()
    return () => {
      PROJECTS.watchers.delete(on)
    }
  }, [])
  return PROJECTS.rows
}

/**
 * What one project is called, from the list this module holds.
 *
 * Falls through to `projectName`, which prints the id when nobody has handed over a title. That is
 * honest in both directions: it is the true name of the thing being asked about, and it is never
 * some other project's title. A caller that needs the reader never to see an id has to wait for the
 * list, and `useProjects` returning null is how it knows to.
 */
export function nameOfProject(rows: readonly ProjectRow[] | null, id: string): string {
  return projectName(id, rows?.find((w) => w.id === id)?.title ?? null)
}
