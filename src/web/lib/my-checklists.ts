// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s.
/**
 * THE READER'S OWN CHECKLISTS OF EVERY PROJECT, READ ONCE FOR THE PAGE AND DRAWN BY EVERY PART THAT SHOWS THEM.
 *
 * The checklists window, on every page while it is switched on, counts the reader's own open items on its press. Home's
 * checklist figure counts the same items. Each asked GET /api/checklists?projects=all with no owner for itself, and the
 * transport joins two identical requests only while the first is still out, so one load of Home asked it twice, or
 * once when the two happened to overlap.
 *
 * Both now draw this one read. The first part drawn asks it, and a part drawn later is handed the answer already
 * read, or joins the read still on its way (`oneRead`, src/web/lib/oneread.ts). With the window switched off, Home is
 * the only reader and still asks it once. Home counts the projects it shows from the reply, because each checklist in
 * it names its project, so a chosen project asks nothing more.
 *
 * IT FOLLOWS THE CHECKLIST KIND ONCE FOR THE PAGE, while any part draws it, at most every 5 seconds. A change reads it
 * again once, and every part draws the new answer. A part that has just written, or the window as it opens, asks
 * again with `readMyChecklistsAgain`, and every part draws that answer too.
 */
import { useSyncExternalStore } from 'react'
import { EVERY_PROJECT, type ProjectChoice } from '@shared/across-projects.ts'
import { api, type ChecklistsAcrossReply } from '../api.ts'
import { useAsync, type AsyncState } from '../components/ui.tsx'
import { oneRead, type OneRead } from './oneread.ts'
import { followChanges, type Follows } from './record-changes.ts'

/** What the read shows, so a change to it reads it again. */
const MY_CHECKLISTS_FOLLOW: Follows = { kinds: ['checklist'], atMostEveryMs: 5000 }

/**
 * THE ONE READ, IN ONE OF TWO SHAPES. The reply names every project, so it is the same whichever project is on screen.
 * While the window is closed it asks only for the items not finished, since every part then draws the counts and the
 * open items. While the window is open it asks for every item, because the open window draws the reader's own cards with
 * their finished items, and an item marked done there stays in view until the window closes. Each shape is its own
 * read, so an answer of one shape is never joined or handed over as the other.
 */
const READ_OPEN_ITEMS = oneRead(() => api.listChecklistsAcross(EVERY_PROJECT, undefined, 'open'), () => 'every project, open items')
const READ_EVERY_ITEM = oneRead(() => api.listChecklistsAcross(EVERY_PROJECT), () => 'every project, every item')

/** Whether the checklists window is open, as it says through `readEveryItemWhileTheWindowIsOpen`. */
let theWindowIsOpen = false
const theShapeAskedNow = (): OneRead<ChecklistsAcrossReply> => (theWindowIsOpen ? READ_EVERY_ITEM : READ_OPEN_ITEMS)

export const readMyChecklistsOnce: OneRead<ChecklistsAcrossReply> = Object.assign(() => theShapeAskedNow()(), {
  again: () => theShapeAskedNow().again(),
  current: () => theShapeAskedNow().current(),
  held: () => theShapeAskedNow().held(),
  // A WRITE MAKES BOTH SHAPES OLD.
  written: () => {
    READ_OPEN_ITEMS.written()
    READ_EVERY_ITEM.written()
  },
  projectKey: () => theShapeAskedNow().projectKey(),
})

/** How many times the page has asked the read again. Each part draws again when it rises. */
let asked = 0
const parts = new Set<() => void>()
let stopFollowing: (() => void) | null = null

function askAgain(written: boolean): void {
  if (written) readMyChecklistsOnce.written()
  // THE FAILURE IS SAID BY EACH PART, which joins this read and draws what it ends in.
  readMyChecklistsOnce.again().catch(() => undefined)
  asked += 1
  for (const part of parts) part()
}

/** Reads the reader's checklists again, for every part that draws them: after a write, or as the window opens. */
export function readMyChecklistsAgain(): void {
  askAgain(true)
}

/**
 * THE WINDOW SAYS IT IS OPEN, and the read asks for every item until the closing this returns is called. The window
 * reads again as it opens, so opening asks nothing here. Closed, the read of the open items may be older than what the
 * window read while it was open, so it is asked again.
 */
export function readEveryItemWhileTheWindowIsOpen(): () => void {
  theWindowIsOpen = true
  return () => {
    theWindowIsOpen = false
    askAgain(false)
  }
}

function drawnBy(part: () => void): () => void {
  parts.add(part)
  if (stopFollowing === null) stopFollowing = followChanges(MY_CHECKLISTS_FOLLOW, () => askAgain(false))
  return () => {
    parts.delete(part)
    if (parts.size === 0 && stopFollowing !== null) {
      stopFollowing()
      stopFollowing = null
    }
  }
}

const askedSoFar = (): number => asked

/** The reader's own checklists of every project, from the one read. */
export function useMyChecklists(): AsyncState<ChecklistsAcrossReply> {
  const asks = useSyncExternalStore(drawnBy, askedSoFar, askedSoFar)
  const [reading] = useAsync(() => readMyChecklistsOnce(), [asks], { startFrom: readMyChecklistsOnce.held() })
  return reading
}

/** The reply narrowed to the projects shown: the whole reply for every project, or the chosen project's checklists. */
export function theseProjectsOf(reply: ChecklistsAcrossReply, project: ProjectChoice): ChecklistsAcrossReply {
  if (project === EVERY_PROJECT) return reply
  return { ...reply, projects: reply.projects.filter((one) => one === project), checklists: reply.checklists.filter((list) => list.workspaceId === project) }
}
