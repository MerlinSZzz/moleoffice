// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The stepped camera and bitmap guard from CForestViewport.tsx, without host imports. */
export interface Rect { x: number; y: number; width: number; height: number }
export interface Camera { left: number; top: number; width: number; height: number }
export function cameraFor(bounds: Rect, view: { scrollLeft: number; scrollTop: number; clientWidth: number; clientHeight: number }, zoom: number): Camera {
  const step = 128, margin = step / zoom
  const scrollLeft = Math.floor(view.scrollLeft / step) * step, scrollTop = Math.floor(view.scrollTop / step) * step
  const left = Math.max(bounds.x, scrollLeft / zoom + bounds.x - margin)
  const top = Math.max(bounds.y, scrollTop / zoom + bounds.y - margin)
  const right = Math.min(bounds.x + bounds.width, (scrollLeft + view.clientWidth) / zoom + bounds.x + 2 * margin)
  const bottom = Math.min(bounds.y + bounds.height, (scrollTop + view.clientHeight) / zoom + bounds.y + 2 * margin)
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }
}
export function bitmapSize(camera: Camera, zoom: number, dpr: number): { width: number; height: number } {
  const pixels = (length: number) => Math.max(1, Math.ceil(length * zoom * dpr - 1e-3))
  return { width: pixels(camera.width), height: pixels(camera.height) }
}
export function overlapsCamera(rect: Rect, camera: Camera): boolean {
  return rect.x + rect.width >= camera.left && rect.y + rect.height >= camera.top && rect.x <= camera.left + camera.width && rect.y <= camera.top + camera.height
}
