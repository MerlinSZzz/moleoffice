// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useSyncExternalStore } from 'react'
import { SHIPPED_SIDEBAR } from '@shared/sidebar-arrangement.ts'
import type { SidebarSetting } from '../../server/lib/sidebar.ts'
import { moleOfficeRequest } from '../api.ts'
import { hearAlways, whenEventsWereLost, whenTheStreamCameBack } from './channel.ts'

let current: SidebarSetting & { readFailure: string | null } = {
  arrangement: SHIPPED_SIDEBAR, shipped: SHIPPED_SIDEBAR, version: '0', changed: false,
  reminders: [], storedButNotUsed: null, readFailure: null,
}
const listeners = new Set<() => void>()
let request = 0
export function sidebarReading() { return current }
export function installSidebarArrangement(value: SidebarSetting): void {
  current = { ...structuredClone(value), readFailure: null }
  for (const listener of listeners) listener()
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function useSidebarArrangement() { return useSyncExternalStore(subscribe, sidebarReading, sidebarReading) }
/**
 * Read before the first drawing and after every settings event, including events from another project.
 * Only the newest read is installed. The value is returned even when a newer read overtook this one, so a caller
 * knows the version this read answered.
 */
export async function readSidebarArrangement(): Promise<SidebarSetting> {
  const thisRequest = ++request
  const value = await moleOfficeRequest<SidebarSetting>('/api/sidebar')
  if (thisRequest === request) installSidebarArrangement(value)
  return value
}
export function listenForSidebarChoices(): void {
  const refresh = () => { void readSidebarArrangement().catch(error => {
    current = { ...current, readFailure: error instanceof Error ? error.message : String(error) }
    for (const listener of listeners) listener()
  }) }
  hearAlways(event => { if (event.name === 'machine.changed' && event.changed.includes('settings')) refresh() }, ['machine.changed'])
  whenEventsWereLost(refresh)
  whenTheStreamCameBack(refresh)
}
