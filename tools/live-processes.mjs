// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DIRECTORY WITH A LIVE PROCESS IN IT IS NOT REMOVED.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * This check used to live in two places, and one of those places was inside the resource-lease
 * design that a decision withdrew on 11 September 2026. The lease was over-design, met before
 * any real need; this was the one thing inside it that did real work.
 *
 * `tools/the-inspector.mjs` had its own copy, reading /proc directly, and used it just before
 * `git worktree remove --force`. `tools/accept.mjs` had none: it asked the office through
 * `POST /api/leases/can-remove`, whose server-side answer was `assertResourceUnleased` in
 * src/server/lib/leases.ts — lines 116 to 122 of it, and only those lines, did this. When the lease
 * went, `accept.mjs` would have been left removing a worktree with nothing looking first.
 *
 * So the check is here, once, and both tools call it. It is not part of the lease and never was: it
 * asks the operating system a question and needs no ledger, no office and no network.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT CAN AND CANNOT SEE, SAID RATHER THAN ASSUMED
 * ---------------------------------------------------------------------------------------
 *
 * It reads `/proc/<pid>/cwd` for every process it is allowed to read. A process owned by another
 * user answers EACCES, and one of those MIGHT be in the tree — nothing here can tell. So a refusal
 * from this check means somebody is in there; a pass means nobody this account can see is in there,
 * which is weaker, and the count of unreadable processes is printed rather than swallowed.
 *
 * IT NEVER READS A PROCESS'S ARGUMENTS. The current directory answers the question, and a command
 * line is somebody's private text.
 *
 * IT IS LINUX-SHAPED. /proc is where this office runs. On a machine with no /proc, `processesIn`
 * throws rather than returning an empty list, because "I could not look" and "nobody is there" are
 * different answers and only one of them permits a removal.
 */
import { readdirSync, readlinkSync, realpathSync } from 'node:fs'
import { resolve, sep } from 'node:path'

/**
 * Readable live process directories inside this tree, regardless of their owner. One entry per
 * process found, and ONE printed line for all the processes that could not be read.
 *
 * ONE LINE FOR THE UNREADABLE ONES, NOT ONE PER PROCESS. Every process owned by another user (PID 1
 * and the rest of the system) answers EACCES here, and a line per process buried the sentence that
 * names the occupant under hundreds of these — the suite of 8 September 2026,
 * tests/two-checks-of-one-run-do-not-share-a-worktree.test.ts, was red on main for that.
 */
export function processesIn(at) {
  // THE TREE'S REAL PATH, NOT THE PATH AS WRITTEN. /proc/<pid>/cwd is the kernel's path, every symbolic link
  // resolved, so a tree named through a link matched no process and an occupied tree was removed (problem
  // jSze4NteBCbY). A tree that is not there holds nobody, as before.
  let directory
  try {
    directory = realpathSync(resolve(at))
  } catch (why) {
    if (why.code === 'ENOENT') return []
    throw why
  }
  const found = []
  let protectedOnes = 0
  for (const pid of readdirSync('/proc').filter((name) => /^\d+$/u.test(name))) {
    try {
      const cwd = readlinkSync(`/proc/${pid}/cwd`)
      if (cwd === directory || cwd.startsWith(directory + sep)) found.push(`PID ${pid} (cwd ${cwd})`)
    } catch (why) {
      if (why.code === 'EACCES') protectedOnes += 1
      else if (why.code !== 'ENOENT' && why.code !== 'ESRCH') throw why
    }
  }
  if (protectedOnes > 0) {
    process.stderr.write(
      `${protectedOnes} processes have a protected current directory that could not be read (other users' processes); ` +
        'none of them can be told to be in this tree or out of it.\n',
    )
  }
  return found
}

/** The same question in one sentence, for a message a person reads. Never throws. */
export function whoStillUses(at) {
  try {
    const found = processesIn(at)
    return found.length === 0
      ? 'No readable live process cwd was found in it.'
      : `Live processes still in it: ${found.join(', ')}.`
  } catch (why) {
    return `Live process directories could not be checked: ${String(why)}.`
  }
}

/**
 * THROW RATHER THAN REMOVE, where a live process is in the tree. The refusal names the path and
 * every process found, because the next question anybody asks is whose it is.
 *
 * A FAILURE TO LOOK IS ALSO A REFUSAL. If /proc cannot be read at all, `processesIn` throws and that
 * throw comes out of here unchanged: a removal that went ahead because the check could not run would
 * be the silent fallback this repository forbids.
 */
export function refuseToRemoveIfAnybodyIsIn(at) {
  const found = processesIn(at)
  if (found.length > 0) {
    throw new Error(`Refusing to remove ${at}: live processes still use it: ${found.join(', ')}.`)
  }
}
