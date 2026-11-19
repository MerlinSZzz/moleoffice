// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER ANY PROCESS OF A GROUP THE TEST RECORDED IS STILL HERE, asked of that group alone. A test looks only at what it
 * made itself, so it never reads the other processes on the machine to answer this.
 *
 * Signal 0 to the group asks without sending anything. ESRCH says no process is left in the group. EPERM says a process
 * is in it that this user may not signal, and that is still a process of the group. A zombie counts until its parent
 * reaps it. A group id below 2 is refused, because signal 0 to it would ask about this test's own group or about every
 * process this user may signal.
 */
export function aGroupIsHere(pgid: number): boolean {
  if (!Number.isInteger(pgid) || pgid < 2) throw new Error(`${String(pgid)} is not a process group a test can have recorded.`)
  try {
    process.kill(-pgid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ESRCH') return false
    if (code === 'EPERM') return true
    throw error
  }
}
