// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
type StartTarget = EventTarget & {
  setTimeout(callback: () => void, delay: number): number
  clearTimeout(id: number): void
}

/** Build a value on its first use instead of in the module-evaluation task. Building the zod
 * schemas at the top level of read.ts, bridge.ts and appearance.ts was about four fifths of the
 * profile samples in that task, which ran 50 to 68 ms at page 4x in round 8g (round 8h-b). */
export function onFirstUse<T>(build: () => T): () => T {
  let made: { value: T } | null = null
  return () => (made ??= { value: build() }).value
}

/** Keep DOM construction and layout out of the module-evaluation task. */
export function deferStart(target: StartTarget, start: () => void): () => void {
  let timer: number | null = null
  const detach = (): void => {
    target.removeEventListener('pagehide', cancel)
    target.removeEventListener('unload', cancel)
  }
  const cancel = (): void => {
    if (timer !== null) { target.clearTimeout(timer); timer = null }
    detach()
  }
  target.addEventListener('pagehide', cancel)
  target.addEventListener('unload', cancel)
  timer = target.setTimeout(() => { timer = null; detach(); start() }, 0)
  return cancel
}
