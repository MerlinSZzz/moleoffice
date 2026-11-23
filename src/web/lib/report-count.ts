// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useSyncExternalStore } from 'react'
import { moleOfficeRequest, subscribeActor } from '../api.ts'

/**
 * WHETHER THE PERSON READING SEES HOW MANY REPORTS ARE UNREAD, read from GET /api/report-count before the first
 * drawing and again whenever the page changes who it acts as. Hidden until a read answers, and hidden when one
 * fails: a number of nought would say nobody left a report, and the brief asks for no false answer. The sidebar, the
 * Reports page and All pages read this one store, so the Settings switch changes all of them at once.
 */
let current = false
const listeners = new Set<() => void>()
let request = 0
function install(shown: boolean): void {
  current = shown
  for (const listener of listeners) listener()
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
function shownNow(): boolean {
  return current
}
export function useReportsCount(): boolean {
  return useSyncExternalStore(subscribe, shownNow, shownNow)
}

/** Reads the answer of whoever the page acts as. Only the newest read is installed, and a failed read installs hidden. */
export async function readReportsCount(): Promise<void> {
  const thisRequest = ++request
  try {
    const answer = await moleOfficeRequest<{ shown: boolean }>('/api/report-count')
    if (thisRequest === request) install(answer.shown === true)
  } catch {
    if (thisRequest === request) install(false)
  }
}

/**
 * Keeps a new answer for the person and draws it once the door has kept it. A read on its way began before the
 * write, so it is not installed after it. A refusal is thrown to the press, which says why; nothing changes.
 */
export async function keepReportsCount(shown: boolean): Promise<void> {
  const answer = await moleOfficeRequest<{ shown: boolean; written: boolean }>('/api/report-count', { method: 'PUT', body: JSON.stringify({ shown }) })
  request++
  install(answer.shown === true)
}

export function listenForReportsCountOfWhoeverReads(): void {
  subscribeActor(() => { void readReportsCount() })
}
