// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { z } from 'zod'
import { pixelRandom } from './pixel-office.ts'

/** Cosmetic display ranges. These never grant a role or change permissions. */
export const PIXEL_SCALE_RANGES: Readonly<Record<string, readonly [number, number]>> = {
  worker: [.3, .5], supervisor: [.8, .9], secretary: [1.5, 1.6], inspector: [1.1, 1.2],
}
export const pixelScaleSchema = z.object({
  version: z.literal(1),
  roleAtGeneration: z.string().nullable(),
  value: z.number().finite(),
}).strict().superRefine((scale, ctx) => {
  const range = scale.roleAtGeneration !== null && Object.hasOwn(PIXEL_SCALE_RANGES, scale.roleAtGeneration) ? PIXEL_SCALE_RANGES[scale.roleAtGeneration] : undefined
  if (range ? scale.value < range[0] || scale.value > range[1] : scale.value !== 1)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'The saved map size is outside its generation role range.', path: ['value'] })
})
export type PixelScale = z.infer<typeof pixelScaleSchema>

/** Draw once, then store this object separately from clothing. The id keeps migration previews repeatable. */
export function generatePixelScale(id: string, role: string | null): PixelScale {
  const range = role !== null && Object.hasOwn(PIXEL_SCALE_RANGES, role) ? PIXEL_SCALE_RANGES[role] : undefined
  if (!range) return { version: 1, roleAtGeneration: role, value: 1 }
  const random = pixelRandom('map-size-v1:' + id)
  // Box–Muller normal, rejected outside three standard deviations. No mass clamped at the edges.
  let normal: number
  do { normal = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random()) } while (Math.abs(normal) > 3)
  return { version: 1, roleAtGeneration: role, value: (range[0] + range[1]) / 2 + normal * (range[1] - range[0]) / 6 }
}
