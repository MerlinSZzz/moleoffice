// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A named setup wait. Call the checkpoint between synchronous fixture writes. */
export async function reviewPanelSetup<T>(
  stage: string,
  within: number,
  work: (checkpoint: () => void) => Promise<T>,
  discard?: (result: T) => Promise<void>,
  waitingOn?: () => string,
): Promise<T> {
  const began = performance.now()
  const error = () => new Error(`Review panel setup: ${stage} did not finish within ${String(within)} ms.${waitingOn === undefined ? '' : ` Last startup wait: ${waitingOn()}.`}`)
  const checkpoint = () => { if (performance.now() - began >= within) throw error() }
  let timer: ReturnType<typeof setTimeout> | undefined
  let expired = false
  let completed: { result: T } | undefined
  console.info(`Review panel setup: starting ${stage}.`)
  const pending = Promise.resolve().then(() => work(checkpoint))
  try {
    const result = await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { expired = true; reject(error()) }, within)
      }),
    ])
    completed = { result }
    checkpoint()
    console.info(`Review panel setup: ${stage} finished in ${String(Math.round(performance.now() - began))} ms.`)
    return result
  } catch (cause) {
    if (completed !== undefined && discard !== undefined) {
      await discard(completed.result)
    } else if (expired && discard !== undefined) {
      // A start that answers after the deadline still owns resources. Dispose of that answer.
      void pending.then(discard, () => {}).catch((cleanup: unknown) => console.error(`Review panel setup: cleanup after ${stage} failed.`, cleanup))
    }
    throw new Error(`Review panel setup failed while ${stage}.`, { cause })
  } finally {
    clearTimeout(timer)
  }
}
