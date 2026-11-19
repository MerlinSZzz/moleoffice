// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { surfaceSize, SURFACE_BYTES } from '../src/render-plan.ts'

it('budgets every simultaneously held static, composed and presented surface, including rounding', () => {
  for (const width of [390, 660, 990, 1440, 8000]) for (const dpr of [1, 2, 4]) for (const zoom of [.04, .5, 1, 2]) {
    const camera = { left: 0, top: 0, width: width / zoom + 256, height: 1200 / zoom + 256 }
    const size = surfaceSize(camera, zoom, dpr, 3)
    expect(size.width * size.height * 4 * 3).toBeLessThanOrEqual(SURFACE_BYTES)
    expect(size.bytes).toBe(size.width * size.height * 4 * 3)
    expect(surfaceSize(camera, zoom, dpr)).toEqual(surfaceSize(camera, zoom, dpr, 2))
  }
})
