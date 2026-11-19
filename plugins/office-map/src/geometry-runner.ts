// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { GeometryEngine } from './worker-protocol.ts'
import { mountGeometryRuntime, type GeometryPort } from './geometry-scheduler.ts'
export type { GeometryPort } from './geometry-scheduler.ts'

/** The legacy study entry retains its published no-roster behaviour. */
export function mountGeometryWorker(port: GeometryPort, now = () => performance.now(), later = (fn: () => void) => setTimeout(fn, 0), cancel = (id: ReturnType<typeof setTimeout>) => clearTimeout(id)): void {
  mountGeometryRuntime(port, new GeometryEngine(true), now, later, cancel)
}
