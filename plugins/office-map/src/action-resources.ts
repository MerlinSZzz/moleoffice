// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** One owner for asynchronous image/PNG work and bounded raster preparation. */
export class DecodeOwner {
  private activeJobs = new Set<{ kind: string }>()
  private queue: { kind: string; start: (finish: () => void) => void }[] = []
  maximum = 0
  acquire(kind: string, start: (finish: () => void) => void): () => boolean {
    const job = { kind, start }; this.queue.push(job); this.advance()
    return () => { const index = this.queue.indexOf(job); if (index < 0) return false; this.queue.splice(index, 1); return true }
  }
  run<T>(kind: string, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let active = false, cancel: () => boolean = () => false
      const abort = (): void => { if (!active && cancel()) { signal?.removeEventListener('abort', abort); reject(Error('Decode cancelled')) } }
      if (signal?.aborted) { reject(Error('Decode cancelled')); return }
      signal?.addEventListener('abort', abort, { once: true })
      cancel = this.acquire(kind, finish => {
        active = true
        const release = (): void => { signal?.removeEventListener('abort', abort); finish() }
        if (signal?.aborted) { release(); reject(Error('Decode cancelled')); return }
        let pending: Promise<T>
        try { pending = work() } catch (error) { release(); reject(error); return }
        void pending.then(resolve, reject).finally(release)
      })
    })
  }
  private advance(): void {
    if (this.activeJobs.size || !this.queue.length) return
    const job = this.queue.shift()!; let ended = false
    const finish = (): void => { if (ended) return; ended = true; this.activeJobs.delete(job); this.advance() }
    this.activeJobs.add(job); this.maximum = Math.max(this.maximum, this.activeJobs.size)
    try { job.start(finish) } catch (error) { finish(); throw error }
  }
  snapshot(): { active: number; kind: string | null; queued: number; maximum: number } {
    return { active: this.activeJobs.size, kind: this.activeJobs.values().next().value?.kind ?? null, queued: this.queue.length, maximum: this.maximum }
  }
}
export const decodeOwner = new DecodeOwner()
export interface Composition { canvas: HTMLCanvasElement; pixels: Uint8Array; width: number; height: number; identity: string | null }
/** Standing and action outputs share eight slots, including their retained RGBA. */
export class Compositions {
  private entries = new Map<string, Composition>()
  constructor(private create: () => HTMLCanvasElement = () => document.createElement('canvas')) {}
  peek(key: string): Composition | null { return this.entries.get(key) ?? null }
  get(key: string): Composition | null {
    const entry = this.entries.get(key)
    if (entry) { this.entries.delete(key); this.entries.set(key, entry) }
    return entry ?? null
  }
  put(key: string, pixels: Uint8Array, width: number, height: number, identity: string | null = null): Composition | null {
    const existing = this.get(key); if (existing) return existing
    let recycled: HTMLCanvasElement | undefined
    if (this.entries.size === 8) { const [old, entry] = this.entries.entries().next().value!; recycled = entry.canvas; this.drop(old) }
    const canvas = recycled ?? this.create(); canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d'); if (!context) { canvas.width = canvas.height = 1; return null }
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer as ArrayBuffer, pixels.byteOffset, pixels.byteLength), width, height), 0, 0)
    const entry = { canvas, pixels, width, height, identity }; this.entries.set(key, entry); return entry
  }
  drop(key: string): void { const entry = this.entries.get(key); if (!entry) return; this.entries.delete(key); entry.canvas.width = entry.canvas.height = 1; entry.pixels = new Uint8Array() }
  dropPrefix(prefix: string): void { for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.drop(key) }
  dropIdentity(identity: string): void { for (const [key, entry] of this.entries) if (entry.identity === identity) this.drop(key) }
  clear(): void { for (const key of this.entries.keys()) this.drop(key) }
  get bytes(): number { return [...this.entries.values()].reduce((sum, entry) => sum + entry.width * entry.height * 4 + entry.pixels.byteLength, 0) }
  snapshot(): { count: number; bytes: number; keys: string[] } { return { count: this.entries.size, bytes: this.bytes, keys: [...this.entries.keys()] } }
}
export const pageCompositions = new Compositions()
