// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { drawingChunks } from './drawing-layout.ts'
import type { GeometryRuntime, GeometryReply, GeometryRequest } from './geometry-runtime.ts'

export interface GeometryPort { onmessage: ((event: MessageEvent<GeometryRequest>) => void) | null; postMessage: (reply: unknown, transfer?: Transferable[]) => void }
/** Scheduling and generation guards are independent of the browser for cancellation tests. */
export function mountGeometryRuntime(port: GeometryPort, engine: Pick<GeometryRuntime, 'work'>, now = () => performance.now(), later = (fn: () => void) => setTimeout(fn, 0), cancel = (id: ReturnType<typeof setTimeout>) => clearTimeout(id)): void {
  let generation = 0, latest = 0, timer: ReturnType<typeof setTimeout> | null = null
  port.onmessage = event => {
    if (!Number.isSafeInteger(event.data.id) || event.data.id <= latest) return
    latest = event.data.id
    const own = ++generation
    if (timer !== null) { cancel(timer); timer = null }
    function* replies(): Generator<GeometryReply | void, GeometryReply | null> {
      const reply = yield* engine.work(event.data)
      if (reply?.kind === 'layout') {
        const chunks = drawingChunks(reply.layout)
        for (;;) {
          const next = chunks.next()
          if (next.done) return { ...reply, layout: next.value }
          yield { id: reply.id, kind: 'drawing', chunk: next.value }
        }
      }
      return reply
    }
    const work = replies()
    const advance = (): void => {
      timer = null
      if (own !== generation) return
      const start = now()
      for (let steps = 0;; steps++) {
        const next = work.next()
        if (next.done) { if (next.value !== null) port.postMessage(next.value, next.value.kind === 'layout' ? next.value.layout.roadDrawing?.map(part => part.buffer as ArrayBuffer) : []); return }
        if (next.value) port.postMessage(next.value, next.value.kind === 'drawing' ? [...(next.value.chunk.roadDrawing?.map(part => part.buffer as ArrayBuffer) ?? []), ...(next.value.chunk.planting?.flatMap(part => [part.positions.buffer as ArrayBuffer, part.sprites.buffer as ArrayBuffer]) ?? [])] : [])
        if (steps >= 63 || now() - start >= 2) { timer = later(advance); return }
      }
    }
    advance()
  }

}
