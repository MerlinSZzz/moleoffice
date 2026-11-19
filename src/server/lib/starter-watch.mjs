// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { isMainThread, parentPort, workerData } from 'node:worker_threads'
import { aWatchOnTheStarter } from '../../config/session-process.mjs'

/** How often the starter's identity is checked. */
export const STARTER_WATCH_PERIOD_MS = 1_000
/** Time allowed for graceful shutdown once the starter is found gone. */
export const STARTER_SHUTDOWN_GRACE_MS = 5_000
/** Later deadline for a main thread that cannot run its own exit timer. */
export const STARTER_FORCE_KILL_MS = 10_000

if (!isMainThread && workerData?.starterWatchPid !== undefined) {
  // The start time as well as the pid identifies the starter: a reused pid is not that process.
  const starter = aWatchOnTheStarter(workerData.starterWatchPid)
  const watch = setInterval(() => {
    const answer = starter()
    if (answer.state === 'there') return
    clearInterval(watch)
    if (answer.state === 'unreadable') {
      parentPort.postMessage(answer)
      return
    }
    parentPort.postMessage(answer)
    // A worker's process.exit ends only that worker. SIGKILL ends this process even if its main
    // thread cannot run signal handlers, without touching any other member of its process group.
    setTimeout(() => process.kill(process.pid, 'SIGKILL'), STARTER_FORCE_KILL_MS)
  }, STARTER_WATCH_PERIOD_MS)
}
