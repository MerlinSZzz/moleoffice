// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { vi } from 'vitest'

const meter = vi.hoisted(() => ({
  on: false, wholePackReads: 0, wholePackBytes: 0, bytes: 0, readFileSyncBytes: 0, readFileSyncCalls: 0,
  peakHeap: 0, peakExternal: 0, peakRss: 0,
  files: new Map<number, string>(),
}))

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  const sample = () => {
    const usage = process.memoryUsage()
    meter.peakHeap = Math.max(meter.peakHeap, usage.heapUsed)
    meter.peakExternal = Math.max(meter.peakExternal, usage.external)
    meter.peakRss = Math.max(meter.peakRss, usage.rss)
  }
  return {
    ...fs,
    openSync: (...args: Parameters<typeof fs.openSync>) => {
      const fd = fs.openSync(...args)
      meter.files.set(fd, String(args[0]))
      return fd
    },
    closeSync: (fd: number) => { meter.files.delete(fd); return fs.closeSync(fd) },
    readSync: (...args: Parameters<typeof fs.readSync>) => {
      const bytes = fs.readSync(...args)
      if (meter.on && /\.(pack|idx)$/.test(meter.files.get(args[0]) ?? '')) { meter.bytes += bytes; sample() }
      return bytes
    },
    readFileSync: (...args: Parameters<typeof fs.readFileSync>) => {
      const result = fs.readFileSync(...args)
      if (meter.on) { meter.readFileSyncBytes += Buffer.byteLength(result); meter.readFileSyncCalls++; sample() }
      if (meter.on && /\.(pack|idx)$/.test(String(args[0]))) {
        const bytes = Buffer.byteLength(result)
        meter.bytes += bytes
        if (String(args[0]).endsWith('.pack')) { meter.wholePackReads++; meter.wholePackBytes += bytes }
        sample()
      }
      return result
    },
  }
})

export async function measureGitReads<T>(act: () => T | Promise<T>) {
  const before = process.memoryUsage()
  Object.assign(meter, { on: true, wholePackReads: 0, wholePackBytes: 0, bytes: 0, readFileSyncBytes: 0, readFileSyncCalls: 0,
    peakHeap: before.heapUsed, peakExternal: before.external, peakRss: before.rss })
  const start = performance.now()
  try {
    const result = await act()
    const after = process.memoryUsage()
    return { result, ms: performance.now() - start, wholePackReads: meter.wholePackReads,
      readFileSyncBytes: meter.readFileSyncBytes, readFileSyncCalls: meter.readFileSyncCalls,
      wholePackBytes: meter.wholePackBytes, bytes: meter.bytes, heapBefore: before.heapUsed, heapAfter: after.heapUsed,
      peakHeap: Math.max(meter.peakHeap, after.heapUsed), peakExternal: Math.max(meter.peakExternal, after.external),
      peakRss: Math.max(meter.peakRss, after.rss) }
  } finally { meter.on = false }
}
