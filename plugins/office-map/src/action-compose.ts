// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { NativePixels } from './look-png.ts'
import type { ActionData, ActionStage } from './action-data.ts'
/** Straight-alpha source-over. Only source-owned object/paw coordinates change. */
function over(out: Uint8Array, at: number, source: Uint8Array, from: number): void {
  const alpha = source[from + 3]!, previous = out[at + 3]!
  if (!alpha) return
  if (alpha === 255) { out.set(source.subarray(from, from + 4), at); return }
  const weight = alpha * 255 + previous * (255 - alpha)
  for (let channel = 0; channel < 3; channel++) out[at + channel] = Math.round((source[from + channel]! * alpha * 255 + out[at + channel]! * previous * (255 - alpha)) / weight)
  out[at + 3] = Math.round(weight / 255)
}
function overlay(out: Uint8Array, width: number, height: number, source: NativePixels, x: number, y: number): void {
  for (let sy = 0; sy < source.height; sy++) for (let sx = 0; sx < source.width; sx++) {
    if (x + sx < 0 || y + sy < 0 || x + sx >= width || y + sy >= height) continue
    over(out, ((y + sy) * width + x + sx) * 4, source.data, (sy * source.width + sx) * 4)
  }
}
export function actionLayers(data: ActionData, stage: ActionStage): { book: number[] | null; paper: number[] | null; pin: number[] | null } {
  return { book: stage.vignette === 'board' ? null : data.composition.bookPositions[stage.state] ?? null,
    paper: stage.vignette === 'board' ? data.composition.paperPositions[stage.state === 'paper-held' ? 'held' : 'board'] ?? null : null,
    pin: stage.vignette === 'board' && stage.pinned ? data.composition.pinPosition : null }
}
export function actionCompositionKey(data: ActionData, stage: ActionStage): string {
  return [stage.source, JSON.stringify(actionLayers(data, stage))].join(':')
}
export function composeAction(data: ActionData, stage: ActionStage, body: NativePixels, objects: Map<string, NativePixels>): Uint8Array {
  const layers = actionLayers(data, stage), origin = stage.origin, base = data.composition.originalWholePoseOrigin
  const out = layers.paper ? new Uint8Array(body.data.length) : body.data.slice()
  const put = (key: string, position: number[]): void => { const object = objects.get(key); if (!object) throw Error('Action object unavailable'); overlay(out, body.width, body.height, object, base[0]! + position[0]! - origin[0]!, base[1]! + position[1]! - origin[1]!) }
  if (layers.paper) { put('paper', layers.paper); overlay(out, body.width, body.height, body, 0, 0) }
  if (layers.book) {
    put('book', layers.book)
    for (const [x, y] of data.pawPixels[stage.source] ?? []) { const at = (y! * body.width + x!) * 4; over(out, at, body.data, at) }
  }
  if (layers.pin) put('pin', layers.pin)
  return out
}
