// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useSyncExternalStore } from 'react'
import { SHIPPED_PINS } from '@shared/sidebar-pins.ts'
import type { KeptSidebarPins, SidebarPinsKept } from '../../server/lib/sidebar-pins.ts'
import { errorMessage, moleOfficeRequest, subscribeActor } from '../api.ts'

/**
 * THE PAGES THE PERSON READING HAS PINNED IN FRONT OF THE SIDEBAR, read from GET /api/sidebar-pins before the first
 * drawing and again whenever the page changes who it acts as. Until a read answers, and when one fails, the shipped
 * pages stand in front and `kept` is 'not-read', because nobody knows yet what the person kept. A failed read says why
 * in `readFailure`, so the sidebar can say so.
 */
export interface SidebarPinsReading { pins: string[]; kept: SidebarPinsKept | 'not-read'; problems: string[]; readFailure: string | null }

let current: SidebarPinsReading = { pins: [...SHIPPED_PINS], kept: 'not-read', problems: [], readFailure: null }
const listeners = new Set<() => void>()
let request = 0
function install(value: SidebarPinsReading): void {
  current = value
  for (const listener of listeners) listener()
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function sidebarPinsReading(): SidebarPinsReading { return current }
export function useSidebarPins(): SidebarPinsReading { return useSyncExternalStore(subscribe, sidebarPinsReading, sidebarPinsReading) }

/** Reads the pins of whoever the page acts as. Only the newest read is installed, and a failed read is installed as one. */
export async function readSidebarPins(): Promise<void> {
  const thisRequest = ++request
  try {
    const value = await moleOfficeRequest<KeptSidebarPins>('/api/sidebar-pins')
    if (thisRequest === request) install({ pins: value.pins, kept: value.kept, problems: value.problems, readFailure: null })
  } catch (error) {
    if (thisRequest === request) install({ pins: [...SHIPPED_PINS], kept: 'not-read', problems: [], readFailure: errorMessage(error) })
  }
}

/**
 * Keeps a new list of pins for the person, and draws it once the door has kept it. A read on its way began before the
 * write, so it is not installed after it. A refusal is thrown to the press, which says why; nothing is drawn as kept.
 */
export async function keepSidebarPins(pins: readonly string[]): Promise<void> {
  const answer = await moleOfficeRequest<{ pins: string[]; written: boolean }>('/api/sidebar-pins', { method: 'PUT', body: JSON.stringify({ pins }) })
  request++
  install({ pins: answer.pins, kept: 'kept', problems: [], readFailure: null })
}

export function listenForPinsOfWhoeverReads(): void {
  subscribeActor(() => { void readSidebarPins() })
}
