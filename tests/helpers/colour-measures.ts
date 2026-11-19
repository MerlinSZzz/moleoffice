// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Measurements of opaque sRGB colours, from computed styles or painted screenshot pixels. */
type Triple = [number, number, number]
export type Lab = { L: number; a: number; b: number }

function rgb(colour: string): Triple {
  const hex = /^#([\da-f]{6})$/i.exec(colour)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16) / 255) as Triple
  const match = /^rgba?\(([^)]+)\)$/.exec(colour)
  if (!match) throw new Error(`Expected opaque sRGB, got ${colour}`)
  const channels = match[1]!.split(/[,\s/]+/).map(Number)
  if ((channels.length !== 3 && channels.length !== 4) || (channels.length === 4 && channels[3] !== 1)
    || channels.slice(0, 3).some((c) => !Number.isFinite(c) || c < 0 || c > 255)) {
    throw new Error(`Expected opaque sRGB, got ${colour}`)
  }
  return channels.slice(0, 3).map((c) => c / 255) as Triple
}

const linear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
const linearRgb = (colour: string) => rgb(colour).map(linear) as Triple

// WCAG relative luminance: https://www.w3.org/WAI/GL/wiki/Relative_luminance
export function contrast(a: string, b: string): number {
  const luminance = (colour: string) => {
    const [r, g, blue] = linearRgb(colour)
    return 0.2126 * r + 0.7152 * g + 0.0722 * blue
  }
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

const degrees = (radians: number) => radians * 180 / Math.PI
const radians = (degrees: number) => degrees * Math.PI / 180
const hue = (a: number, b: number) => (degrees(Math.atan2(b, a)) + 360) % 360

// Ottosson's linear-sRGB matrices: https://bottosson.github.io/posts/oklab/
export function oklch(colour: string): { L: number; C: number; h: number } {
  const [r, g, b] = linearRgb(colour)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
  const blue = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  return { L, C: Math.hypot(a, blue), h: hue(a, blue) }
}

/** CIELAB with the sRGB D65 reference white; both colours use the same white. */
export function lab(colour: string): Lab {
  const [r, g, b] = linearRgb(colour)
  const f = (t: number) => t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047)
  const y = f(0.2126729 * r + 0.7151522 * g + 0.0721750 * b)
  const z = f((0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883)
  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) }
}

/** CIEDE2000, kL=kC=kH=1. Sharma, Wu, Dalal's equations and test table:
 * https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/ */
export function deltaE2000(first: Lab, second: Lab): number {
  const meanC = (Math.hypot(first.a, first.b) + Math.hypot(second.a, second.b)) / 2
  const G = 0.5 * (1 - Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)))
  const a1 = (1 + G) * first.a
  const a2 = (1 + G) * second.a
  const C1 = Math.hypot(a1, first.b)
  const C2 = Math.hypot(a2, second.b)
  const h1 = C1 === 0 ? 0 : hue(a1, first.b)
  const h2 = C2 === 0 ? 0 : hue(a2, second.b)
  const dL = second.L - first.L
  const dC = C2 - C1
  let dh = h2 - h1
  if (C1 * C2 === 0) dh = 0
  else if (dh > 180) dh -= 360
  else if (dh < -180) dh += 360
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin(radians(dh / 2))
  const meanL = (first.L + second.L) / 2
  const meanCp = (C1 + C2) / 2
  let meanH = (h1 + h2) / 2
  if (C1 * C2 === 0) meanH = h1 + h2
  else if (Math.abs(h1 - h2) > 180) meanH += h1 + h2 < 360 ? 180 : -180
  const T = 1 - 0.17 * Math.cos(radians(meanH - 30)) + 0.24 * Math.cos(radians(2 * meanH))
    + 0.32 * Math.cos(radians(3 * meanH + 6)) - 0.20 * Math.cos(radians(4 * meanH - 63))
  const SL = 1 + 0.015 * (meanL - 50) ** 2 / Math.sqrt(20 + (meanL - 50) ** 2)
  const SC = 1 + 0.045 * meanCp
  const SH = 1 + 0.015 * meanCp * T
  const rotation = -2 * Math.sqrt(meanCp ** 7 / (meanCp ** 7 + 25 ** 7))
    * Math.sin(radians(60 * Math.exp(-(((meanH - 275) / 25) ** 2))))
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + rotation * (dC / SC) * (dH / SH))
}

/** The opaque screenshot pixel furthest from the bubble by squared RGB distance. */
export function strongestPaintedPixel(pixels: ArrayLike<number>, bubble: string): string {
  if (pixels.length === 0 || pixels.length % 4 !== 0) throw new Error('Expected whole RGBA pixels.')
  const background = rgb(bubble).map((channel) => channel * 255)
  let furthest = -1
  let strongest = ''
  for (let at = 0; at < pixels.length; at += 4) {
    if (pixels[at + 3] !== 255) throw new Error('Expected opaque painted pixels.')
    const channels = [pixels[at]!, pixels[at + 1]!, pixels[at + 2]!]
    const distance = channels.reduce((sum, channel, index) => sum + (channel - background[index]!) ** 2, 0)
    if (distance > furthest) {
      furthest = distance
      strongest = '#' + channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')
    }
  }
  return strongest
}
