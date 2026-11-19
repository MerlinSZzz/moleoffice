// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13y, pages and speed. The browser's doors to whether the office map moves, the pixel looks, portraits,
// avatars and visits. Wave 13y's round 68 moved them here out of the one `api` object in src/web/api.ts; a line adds
// its new doors to its own part, and src/web/api-parts/join.ts joins every part into `api`.
import { request } from '../api.ts'
import type { PixelAppearanceReading, PixelSettingsReading } from '../../server/lib/pixel-office.ts'
import type { PixelAppearance, PixelMotionSetting } from '@shared/pixel-office.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import type { Visit as VisitOnTheWire } from '@shared/worlds.ts'
import type { PortraitOnOffer } from '@shared/portraits.ts'
import type { AvatarOnOffer } from '../../server/lib/avatars.ts'

export const officeMapDoors = {

  /** Whether the office map moves (wave 13y round 119): the plugin's row on Settings reads and changes it. */
  pixelSettings: () => request<PixelSettingsReading>('/api/office/scene-settings'),
  changePixelSettings: (settings: PixelMotionSetting) => request<PixelSettingsReading>('/api/office/scene-settings', { method: 'PATCH', body: JSON.stringify(settings) }),
  pixelAppearance: (id: string) => request<PixelAppearanceReading>('/api/office/appearance/' + encodeURIComponent(id)),
  changePixelAppearance: (id: string, appearance: PixelAppearance | null) => request<PixelAppearanceReading>('/api/office/appearance/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify({ appearance }) }),

  avatarsOnOffer: (forWhom?: string) =>
    request<{ avatars: AvatarOnOffer[]; offered: AvatarOnOffer | null; offeredFor: ParticipantRef | null }>(
      forWhom === undefined ? '/api/avatars' : `/api/avatars?for=${encodeURIComponent(forWhom)}`,
    ),

  /** The pictures painted for each role, by role. Nothing here paints one; they are files. */
  portraits: () =>
    request<{ roles: Record<string, PortraitOnOffer[]>; note: string }>('/api/portraits'),

  /**
   * The pictures in ONE folder: a role's three, or the ones one person keeps for themselves.
   *
   * Criterion P52. The listing above names every role and no custom folder, because whose a picture
   * is decides who sees it; this is how a caller asks for one folder by name.
   */
  portraitsIn: (set: 'role' | 'custom', of: string) =>
    request<{ set: string; of: string; portraits: PortraitOnOffer[]; note: string }>(
      `/api/portraits/${set}/${encodeURIComponent(of)}`,
    ),

  /** Who is working away from home right now, and where that list came from. */
  visits: () => request<{ visits: VisitOnTheWire[]; all: VisitOnTheWire[]; from: string; note: string; thisWorld: string | null }>(
    '/api/office/visits',
  ),
}
