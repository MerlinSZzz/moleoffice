// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { contrast, deltaE2000, lab, oklch, strongestPaintedPixel } from './helpers/colour-measures.ts'

it('matches known contrast, OKLCH, CIELAB and CIEDE2000 values', () => {
  expect.soft(contrast('rgb(0, 0, 0)', 'rgb(255, 255, 255)')).toBeCloseTo(21, 10)
  expect.soft(contrast('#ffffff', '#ffffff')).toBe(1)
  // sRGB red, using Ottosson's published conversion matrices.
  const red = oklch('#ff0000')
  expect.soft(red.L).toBeCloseTo(0.627955, 6)
  expect.soft(red.C).toBeCloseTo(0.257683, 6)
  expect.soft(red.h).toBeCloseTo(29.233885, 5)
  const redLab = lab('#ff0000')
  expect.soft(redLab.L).toBeCloseTo(53.2408, 4)
  expect.soft(redLab.a).toBeCloseTo(80.0925, 4)
  expect.soft(redLab.b).toBeCloseTo(67.2032, 4)
  // First pair in Sharma, Wu and Dalal's supplementary test table.
  const first = { L: 50, a: 2.6772, b: -79.7751 }
  const second = { L: 50, a: 0, b: -82.7485 }
  expect.soft(deltaE2000(first, second)).toBeCloseTo(2.0425, 4)
  expect.soft(deltaE2000(second, first)).toBeCloseTo(2.0425, 4)
  expect.soft(deltaE2000(first, first)).toBe(0)
})

it('takes the strongest painted pixel by squared RGB distance from the bubble', () => {
  // Green has greater luminance here; red has the greater squared RGB distance.
  const pixels = [0, 0, 0, 255, 240, 0, 0, 255, 0, 200, 0, 255, 120, 0, 0, 255]
  expect(strongestPaintedPixel(pixels, '#000000')).toBe('#f00000')
  expect(strongestPaintedPixel(pixels, 'rgb(240, 0, 0)')).toBe('#00c800')
  expect(() => strongestPaintedPixel([0, 0, 0, 0], '#ffffff')).toThrow('opaque')
  expect(() => strongestPaintedPixel([], '#ffffff')).toThrow('whole RGBA')
})
