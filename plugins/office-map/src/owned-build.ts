// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { SlicedBuild } from './layout-index.ts'
import { decodeOwner, type DecodeOwner } from './action-resources.ts'
/** Keep the sliced painter under the same materialization owner without polling. */
export class OwnedBuild<T> extends SlicedBuild<T> {
  private generation = 0
  private internalStart = false
  private waiting: (() => void) | null = null
  private release: (() => void) | null = null
  private pendingWork: Generator<void, T> | null = null
  constructor(private owner: DecodeOwner = decodeOwner) { super() }
  override start(work: Generator<void, T>, done: (value: T) => void): void {
    this.cancel(); const generation = this.generation; this.pendingWork = work
    this.waiting = this.owner.acquire('map materialization', release => {
      if (generation !== this.generation) { work.return(undefined as T); release(); return }
      let ended = false
      const finish = (): void => { if (ended) return; ended = true; if (this.release === finish) this.release = null; release() }
      const guarded = (function* (builder: OwnedBuild<T>): Generator<void, T> {
        let normal = false
        try { const value = yield* work; normal = true; return value }
        finally { if (!normal) { finish(); queueMicrotask(() => { if (generation === builder.generation) builder.cancel() }) } }
      })(this)
      this.release = finish; this.pendingWork = null; this.internalStart = true
      try { super.start(guarded, value => { try { done(value) } finally { finish() } }) }
      finally { this.internalStart = false }
    })
  }
  override cancel(): void {
    if (this.internalStart) { super.cancel(); return }
    this.generation++; this.waiting?.(); this.waiting = null
    this.pendingWork?.return(undefined as T); this.pendingWork = null
    super.cancel(); const release = this.release; this.release = null; release?.()
  }
}
