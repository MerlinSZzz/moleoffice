// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Open new and existing notes over the office, and name the desktop shortcut where it is available. */
import { type MouseEvent, useSyncExternalStore } from 'react'
import { isTheWindow, theSystemOn } from '../../config/the-window-mark.mjs'
import { theQuickNoteKey } from '../../desktop/the-quick-note.mjs'
import { currentWorkspace, setWorkspace } from './workspace.ts'

/** Each opening is separate, even when it names the same note as the last one. */
export interface NoteOpening { key: number; id?: string }
let openings = 0
let beside: NoteOpening | null = null
const watchers = new Set<() => void>()

function showBeside(opening: NoteOpening | null): void {
  beside = opening
  for (const watcher of watchers) watcher()
}

/** Put a new or existing note over the office page. */
export function openAQuickNote(id?: string): void {
  showBeside({ key: ++openings, ...(id === undefined ? {} : { id }) })
}

/**
 * A press on a link to a note. The note's project is chosen first, and a plain click opens the note over the page. A
 * click with a key held, or with another button, is left to the browser, which opens the link's address as it does for
 * any link.
 */
export function openTheLinkedNote(event: MouseEvent, note: { id: string; workspaceId: string }): void {
  if (note.workspaceId !== currentWorkspace()) setWorkspace(note.workspaceId)
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  openAQuickNote(note.id)
}

/** The key that opens a note from any program, as its system names it. */
export function theKeyOnThePress(): string | null {
  if (!isTheWindow(navigator.userAgent)) return null
  const system = theSystemOn(navigator.userAgent)
  return system === null ? null : theQuickNoteKey(system).said
}

/** Put the note away. Its last changes are sent as it stops being drawn. */
export function closeTheNoteBeside(key?: number): void {
  if (key !== undefined && beside?.key !== key) return
  showBeside(null)
}

export function useTheNoteBeside(): NoteOpening | null {
  return useSyncExternalStore(
    (watcher) => { watchers.add(watcher); return () => watchers.delete(watcher) },
    () => beside,
  )
}
