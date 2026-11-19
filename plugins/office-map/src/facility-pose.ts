// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Station } from './geometry.ts'
export type FacilityPose = 'stand' | 'carry' | 'cheer' | 'wave'
/** Structural facility metadata only; no presence or work-state inference. */
export const facilityPose = (station: Station | undefined): FacilityPose => (station as (Station & { pose?: FacilityPose }) | undefined)?.pose ?? 'stand'
