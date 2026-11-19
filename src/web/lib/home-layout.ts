// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { HomeLayout } from '@shared/home-layout.ts'
import type { KeptHomeLayout } from '../../server/lib/home-layout.ts'
import { moleOfficeRequest } from '../api.ts'
import { oneRead, type OneRead } from './oneread.ts'

/** The layout kept for the person reading: A when nothing is kept, and A with the reasons when the kept one cannot be read. */
export function readTheHomeLayout(): Promise<KeptHomeLayout> {
  return moleOfficeRequest<KeptHomeLayout>('/api/home-layout')
}

/**
 * THE KEPT LAYOUT, READ ONCE IN A PAGE LOAD and held, as Home's other reads are (homereads.ts), so Home opened again
 * draws the layout it holds at once, with no loading line. The layout is the person's own and not a project's, so a
 * project change does not read it again; the slot is still kept apart for each person who asks.
 */
export const readTheHomeLayoutOnce: OneRead<KeptHomeLayout> = oneRead(readTheHomeLayout, () => 'every project')

/** Keeps a layout for the person reading. The door refuses an agent, and refuses a layout with a problem. */
export async function keepTheHomeLayout(layout: HomeLayout): Promise<{ layout: HomeLayout; written: boolean }> {
  const answer = await moleOfficeRequest<{ layout: HomeLayout; written: boolean }>('/api/home-layout', { method: 'PUT', body: JSON.stringify({ layout }) })
  // THE HELD LAYOUT IS NOW OLD, so it is read again: a read already on its way began before this write, and is asked
  // once more after it. A failed read holds nothing, and the next Home drawn reads the layout for itself and says so.
  readTheHomeLayoutOnce.written()
  readTheHomeLayoutOnce.again().catch(() => undefined)
  return answer
}
