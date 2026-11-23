// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BATCH OF NAMED TEST FILES RUNS IN A PROCESS GROUP OF ITS OWN, so its seat and its ledger row are given back when it
 * ends, however it ends.
 *
 * WHY. The office holds a test-batches seat for a process group, and gives it back once that group has ended. A tool
 * started by a shell or an agent runs in its caller's group, so a batch stopped by kill -9 left its seat held for as
 * long as its caller lived, and the tests it had started ran on. Inside a sandbox the seat was held by the sandbox's
 * row for the agent, so it stayed held until the agent ended.
 *
 * HOW. tools/run-named-tests.mjs calls aGroupOfItsOwn before anything else. When the tool is not the leader of its
 * own process group, it starts itself again in a new group (spawn with detached), with the same arguments, variables
 * and standard streams, and only waits. The seat, the ledger row and every test process then belong to that group.
 * A descriptor holding the tsc lock is passed on at its own number, so the restarted batch sees the shell's hold and
 * does not deadlock at the gate with a tsc waiting for the lock held by the outer process.
 * This outer process passes SIGTERM, SIGINT and SIGHUP on to the batch's group, and ends with the batch's exit code, or
 * by the signal that ended it. When it ends, it stops whatever of the batch's group is still running, and says so.
 * When the tool already leads its group, as when the merge tool or a test starts it with detached, it starts nothing.
 *
 * THE BATCH NOTICES WHEN ITS STARTER ENDS. The outer process holds one end of a pipe, at the batch's fd 3. It is
 * never written, and it ends when the outer process ends in any way, kill -9 and a kill of its whole group as well.
 * The batch then gives its seat and its row back, says so, and stops its own group with SIGKILL, itself included. A
 * batch still in line for its seat then has no seat to give back: the office gives back the row it waited in once the
 * batch's group has ended.
 *
 * WINDOWS has no process groups (thereAreProcessGroups), so there the tool runs as it was started.
 */

import { spawn } from 'node:child_process'
import { Socket } from 'node:net'
import { thereAreProcessGroups } from '../src/config/process-reader.mjs'
import { theDescriptorThatHoldsTheTscLock } from './the-tsc-lock.mjs'

/** The variable that tells the batch its starter holds the other end of the pipe at fd 3. */
const THE_STARTERS_PIPE = 'RUN_NAMED_TESTS_STARTERS_PIPE'

/** The signals the outer process passes on to the batch's group. */
const PASSED_ON = /** @type {const} */ (['SIGTERM', 'SIGINT', 'SIGHUP'])

/** The note a seat is given back with when the process that started the batch ended first. */
export const THE_STARTER_ENDED = 'the process that started the batch ended'

/**
 * RUN THIS TOOL IN A PROCESS GROUP OF ITS OWN. In the process that is not its group's leader, this starts the tool
 * again in a new group and never returns: that process ends when the batch does. In the batch, it answers
 * `whenTheStarterEnds(stop)`: once the process that started it has ended, `stop` gives the seat and the row back, and
 * then the batch's whole group is stopped.
 *
 * @param {(words: string) => void} [say]
 * @returns {Promise<{ whenTheStarterEnds: (stop: () => Promise<void>) => void }>}
 */
export async function aGroupOfItsOwn(say = (words) => console.error(words)) {
  const startedByItsStarter = process.env[THE_STARTERS_PIPE] === '1'
  // Not passed on: vitest and the tests it starts are no batch of this tool's.
  delete process.env[THE_STARTERS_PIPE]
  if (!thereAreProcessGroups()) return { whenTheStarterEnds: () => {} }
  // IT LEADS ITS GROUP when a group with its own process id is there: a group's id is its leader's process id, and the
  // system gives no new process an id a group still has. Asked of the system with signal 0, not through the process
  // reader, whose reading of a start time asks getconf on PATH, and a caller may start the tool with a PATH of its own.
  if (aGroupIsThere(process.pid)) {
    if (!startedByItsStarter) return { whenTheStarterEnds: () => {} }
    return { whenTheStarterEnds: (stop) => theStartersEnd(stop, say) }
  }
  if (startedByItsStarter) {
    say('run-named-tests: it was started in a group of its own and does not lead a process group, so it starts nothing.')
    process.exit(1)
  }

  const descriptor = theDescriptorThatHoldsTheTscLock()
  /** @type {Array<'inherit' | 'pipe' | 'ignore' | number>} */
  const stdio = ['inherit', 'inherit', 'inherit', 'pipe']
  if (descriptor !== null) {
    const number = Number(descriptor)
    if (number <= 3) {
      say(`run-named-tests: the shell handed the tsc lock in on descriptor ${descriptor}, which the restart needs, so start the batch without that shell.`)
      process.exit(1)
    }
    while (stdio.length < number) stdio.push('ignore')
    stdio.push(number)
  }

  const batch = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    detached: true,
    stdio,
    env: { ...process.env, [THE_STARTERS_PIPE]: '1' },
  })
  const passOn = PASSED_ON.map((signal) => /** @type {const} */ ([signal, () => {
    try {
      process.kill(-Number(batch.pid), signal)
    } catch (error) {
      // The group has ended already, and its end is on its way here as the batch's exit.
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ESRCH') throw error
    }
  }]))
  for (const [signal, listener] of passOn) process.on(signal, listener)
  batch.on('error', (error) => {
    say(`run-named-tests: could not start itself in a process group of its own: ${error.message}. Nothing ran.`)
    process.exit(1)
  })
  batch.on('exit', (code, signal) => {
    for (const [one, listener] of passOn) process.off(one, listener)
    const group = Number(batch.pid)
    if (aGroupIsThere(group)) {
      say(`run-named-tests: processes were still in the batch's group ${String(group)} after the batch ended, so the group was sent SIGKILL.`)
      try {
        process.kill(-group, 'SIGKILL')
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ESRCH') throw error
      }
    }
    // THE SIGNAL ENDS THIS PROCESS TOO: its listeners are off, so the system's own action takes it.
    if (signal !== null) process.kill(process.pid, signal)
    process.exit(code ?? 1)
  })
  return await new Promise(() => {})
}

/** Whether any process is still in the group `group`. */
function aGroupIsThere(group) {
  try {
    process.kill(-group, 0)
    return true
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ESRCH') return false
    throw error
  }
}

/**
 * Watch the pipe the starter holds the other end of. It is never written, so its end is the starter's end: then
 * `stop` runs once, and the batch's group is stopped.
 *
 * @param {() => Promise<void>} stop
 * @param {(words: string) => void} say
 */
function theStartersEnd(stop, say) {
  const pipe = new Socket({ fd: 3, readable: true, writable: false })
  let ended = false
  const onEnd = async () => {
    if (ended) return
    ended = true
    say(`run-named-tests: the process that started this batch ended, so the batch gives its seat and its row back and stops its process group ${String(process.pid)}.`)
    await stop()
    process.kill(-process.pid, 'SIGKILL')
  }
  pipe.on('end', onEnd)
  pipe.on('close', onEnd)
  pipe.on('error', onEnd)
  pipe.resume()
  // The watch alone does not keep the batch running once its work is done.
  pipe.unref()
}
