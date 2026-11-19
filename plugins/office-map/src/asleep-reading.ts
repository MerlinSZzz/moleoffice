// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { PluginAsleepView } from '../../../src/shared/plugin-read.ts'

/** Who the map draws asleep, and where that came from. `picture`: a picture tool's made-up sleepers, which replace
 * the read and are labelled as made up. `read`: the office's asleep read. `reading`: not answered yet. `unread`: the
 * read failed, so who is asleep now is not known and nobody is drawn asleep. */
export interface AsleepReading { from: 'picture' | 'read' | 'reading' | 'unread'; ids: ReadonlySet<string> }

export function asleepReading(picture: readonly string[] | undefined, read: { data: Pick<PluginAsleepView, 'agents'> | null; error: unknown } | undefined): AsleepReading {
  if (picture) return { from: 'picture', ids: new Set(picture) }
  if (!read || read.error !== null) return { from: 'unread', ids: new Set() }
  if (read.data === null) return { from: 'reading', ids: new Set() }
  return { from: 'read', ids: new Set(read.data.agents.map(one => one.id)) }
}
