// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECKS A RUN'S SCRATCH FOLDER PASSES BEFORE THE SANDBOX HELPER REMOVES IT (the coordinator, message R2bM8BIhYPkZ):
 * it is still exactly the folder the helper made for the run, no process works in it or holds a file in it, and no git
 * worktree inside it holds work that only that worktree holds. They are here, apart from tools/sandbox-start.mjs, so a
 * test can ask them directly.
 *
 * ASKED TWICE (the inspector's refusal J0Xw7UM9VoyT, which the coordinator agreed in bnAX5wC4GDQP): once before the helper
 * asks the office about the run and its records, and again, through theScratchFolderIsStillFree, just before the removal,
 * with no wait between that second answer and the removal. A process the command left behind keeps running after it
 * ends, and it may start working in the folder, or open a file in it, while the office is asked; a deletion path checks
 * again right before it removes.
 */
import { spawnSync } from 'node:child_process'
import { lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { guardedGitArguments, guardedGitEnvironment } from '../src/config/guarded-git.mjs'

/**
 * WHY THE FOLDER AT `path` IS NOT EXACTLY THE ONE THE HELPER MADE FOR THIS RUN (`asMade`, recorded when it was made), or
 * null when it is: the same device and inode as when it was made, not a link, resolving to the same path, in the container's temporary folder it was made in.
 */
export function notTheFolderMade(path, asMade) {
  const now = lstatSync(path)
  if (now.isSymbolicLink()) return `a link to ${readlinkSync(path)} stands at its path, not the folder this helper made`
  if (!now.isDirectory()) return 'something that is not a folder stands at its path'
  if (now.dev !== asMade.dev || now.ino !== asMade.ino) return 'another folder stands at its path, not the one this helper made'
  const real = realpathSync(path)
  if (real !== asMade.real) return `it resolves to ${real}, and it was made as ${asMade.real}`
  if (dirname(real) !== asMade.parent) return `it is not in the temporary folder ${asMade.parent}`
  return null
}

/**
 * WHICH PROCESSES WORK IN THE FOLDER OR HOLD A FILE IN IT, read from /proc/<pid>/cwd, /proc/<pid>/fd and its entries,
 * /proc/<pid>/comm, /proc/<pid>/status, /proc/<pid>/task and /proc/<pid>/stat as this helper's user can read them.
 * `unreadable` names each process whose cwd or fds could not be fully read to it (theProcessNotRead),
 * except one that is gone by the time its name is read (theProcessIsGone), one that has ended and waits only to be
 * reaped (theProcessHasEnded), and a kernel thread (theProcessIsAKernelThread): none holds a file open in the folder.
 */
export function theProcessesUsing(real, proc = '/proc') {
  const inside = (target) => target === real || target.startsWith(`${real}/`)
  const using = []
  const unreadable = []
  for (const pid of readdirSync(proc)) {
    if (!/^\d+$/.test(pid)) continue
    const refused = new Set()
    const codes = new Set()
    const refusedOr = (what, error) => {
      if (error?.code === 'EACCES' || error?.code === 'EPERM') { refused.add(what); codes.add(error.code) }
      else if (!['ENOENT', 'ESRCH'].includes(error?.code)) throw error
    }
    try {
      if (inside(readlinkSync(`${proc}/${pid}/cwd`))) {
        using.push(`process ${pid} works in it`)
        continue
      }
    } catch (error) {
      refusedOr('working folder', error)
    }
    try {
      for (const fd of readdirSync(`${proc}/${pid}/fd`)) {
        let target = ''
        try {
          target = readlinkSync(`${proc}/${pid}/fd/${fd}`)
        } catch (error) {
          refusedOr('open files', error)
          continue
        }
        if (inside(target)) {
          using.push(`process ${pid} holds ${target} open`)
          break
        }
      }
    } catch (error) {
      refusedOr('open files', error)
    }
    if (refused.size > 0 && !theProcessIsGone(proc, pid) && !theProcessHasEnded(proc, pid) && !theProcessIsAKernelThread(proc, pid)) {
      const named = theProcessNotRead(proc, pid, [...refused], [...codes])
      if (named !== null) unreadable.push(named)
    }
  }
  return { using, unreadable }
}

/**
 * WHETHER A PROCESS WHOSE READS WERE REFUSED IS A KERNEL THREAD: bit 0x00200000 of the flags in /proc/<pid>/stat, the
 * ninth field, counted after the last ')' because a command name may hold spaces and ')'. The kernel sets the flag, every
 * user may read stat, and a kernel thread works in / and holds no file open. A parent pid is not evidence: pid 2 can be
 * an ordinary process in a namespace. A stat that cannot be read or does not parse answers false, so the process is kept.
 */
function theProcessIsAKernelThread(proc, pid) {
  try {
    const stat = readFileSync(`${proc}/${pid}/stat`, 'utf8')
    const end = stat.lastIndexOf(')')
    if (end < 0) return false
    const flags = stat.slice(end + 1).trim().split(/\s+/)[6]
    if (flags === undefined || !/^\d+$/.test(flags)) return false
    const value = Number(flags)
    return Number.isSafeInteger(value) && value <= 0xffffffff && (value & 0x00200000) !== 0
  } catch (error) {
    if (['EACCES', 'EPERM', 'ENOENT', 'ESRCH'].includes(error?.code)) return false
    throw error
  }
}

/**
 * WHETHER A PROCESS WHOSE READS WERE REFUSED HAS SINCE EXITED (receipt sf9-scu4CJC8: the sweep kept a folder for a process
 * whose comm and status were already gone). A live process always has both, and either refusing to be read (EACCES, EPERM)
 * means it is still there; only both gone (ENOENT, ESRCH) means it exited. A pid taken again by a new process in between
 * has both, so it is still counted: the check fails toward keeping the folder.
 */
function theProcessIsGone(proc, pid) {
  const gone = (file) => {
    try {
      lstatSync(`${proc}/${pid}/${file}`)
      return false
    } catch (error) {
      if (['ENOENT', 'ESRCH'].includes(error?.code)) return true
      if (['EACCES', 'EPERM'].includes(error?.code)) return false
      throw error
    }
  }
  return gone('comm') && gone('status')
}

/**
 * WHETHER A PROCESS WHOSE READS WERE REFUSED HAS ENDED AND WAITS ONLY TO BE REAPED: the State line of its status is Z
 * (ended, and its parent has not yet collected it) or X (being collected), and its task folder lists no thread but its
 * own. Such a process has already closed its files and let go of its working folder. /proc shows a process with no memory
 * left as root's, so its open files read as refused (EACCES) even to its own user. A first thread that has ended while
 * other threads of it still run is counted, and so are a process partway through its exit (any other State) and a new
 * process that took the pid. State is read first and the task folder second, and a read that fails counts the process.
 */
function theProcessHasEnded(proc, pid) {
  const read = (what) => {
    try {
      return what()
    } catch (error) {
      if (['EACCES', 'EPERM', 'ENOENT', 'ESRCH'].includes(error?.code)) return null
      throw error
    }
  }
  const state = /^State:\s+(\S)/m.exec(read(() => readFileSync(`${proc}/${pid}/status`, 'utf8')) ?? '')?.[1]
  if (state !== 'Z' && state !== 'X') return false
  const threads = read(() => readdirSync(`${proc}/${pid}/task`))
  return threads !== null && threads.length === 1 && threads[0] === pid
}

/**
 * ONE PROCESS THE HELPER COULD NOT READ, NAMED (the secretary, on the sweep that kept folders for a test's not-dumpable
 * python3): its pid, its command name from /proc/<pid>/comm, its real user from the Uid line of /proc/<pid>/status, and
 * which reads were refused with which error. A name or user that could not be read is said so. It answers null when the
 * comm and the status are both gone (ENOENT, ESRCH) by the time they are read: the process has exited since
 * theProcessIsGone found them, and a process that has exited holds nothing open.
 */
function theProcessNotRead(proc, pid, refused, codes) {
  const gone = []
  const read = (file) => {
    try {
      return readFileSync(`${proc}/${pid}/${file}`, 'utf8')
    } catch (error) {
      if (['ENOENT', 'ESRCH'].includes(error?.code)) gone.push(file)
      else if (!['EACCES', 'EPERM'].includes(error?.code)) throw error
      return null
    }
  }
  const comm = read('comm')
  const status = read('status')
  if (gone.length === 2) return null
  // A PROCESS SETS ITS OWN COMMAND NAME, so each control character in it (below 0x20, and 0x7f) is shown as a ?, and the
  // name cannot start a line of its own in the logs it is written to.
  const name = comm?.trim().replace(/[\x00-\x1f\x7f]/g, '?') || 'name not read'
  const uid = /^Uid:\s+(\d+)/m.exec(status ?? '')?.[1]
  const user = uid === undefined ? 'user not read' : `user ${uid}`
  return `process ${pid} (${name}, ${user}), whose ${refused.join(' and ')} ${refused.includes('open files') ? 'were' : 'was'} refused (${codes.join(', ')})`
}

/** The count, first five and remaining count of the processes theProcessesUsing could not read, as one line says them. */
export function theProcessesNotRead(unreadable) {
  const shown = unreadable.slice(0, 5).join('; ')
  const more = unreadable.length > 5 ? `; and ${String(unreadable.length - 5)} more` : ''
  return `${String(unreadable.length)} process${unreadable.length === 1 ? '' : 'es'} could not be read by this helper's user: ${shown}${more}`
}

/**
 * WHY THE FOLDER MAY NOT GO NOW, asked just before the removal: whether it is still the folder made (notTheFolderMade) and
 * whether any process works in it or holds a file in it (theProcessesUsing). Answers `{ why: null, unreadable }` when it
 * may go, or `{ why, unreadable }` with the first reason it may not; `unreadable` names the processes not read, and is
 * empty when the folder is not the one made, because no process is read for it then.
 * @param {string} path
 * @param {{ real: string, parent: string, dev: number, ino: number }} asMade
 */
export function theScratchFolderIsStillFree(path, asMade) {
  const wrong = notTheFolderMade(path, asMade)
  if (wrong !== null) return { why: wrong, unreadable: [] }
  const { using, unreadable } = theProcessesUsing(asMade.real)
  return { why: using.length > 0 ? using.join('; ') : null, unreadable }
}

/** How long one git call about a worktree may take; a call that takes longer keeps the folder. */
const A_GIT_CALL_MAY_TAKE_MS = 30_000

/**
 * A GIT WORKTREE INSIDE THE FOLDER AT `real` KEEPS IT while the worktree holds changes or files nobody committed, or a
 * HEAD that no ref of its repository contains, or git cannot say, because removing the folder takes whatever only that
 * worktree holds; this answers that reason, naming the worktree and its commit or git's own words, or null.
 */
export function whyAWorktreeKeepsIt(real) {
  for (const worktree of theWorktreesIn(real)) {
    const why = whyThisWorktreeKeepsIt(worktree)
    if (why !== null) return why
  }
  return null
}

/**
 * The worktrees at or under `dir`, each found by a `.git` that is a regular file. Symbolic links are not followed, no
 * folder named .git is entered, and nothing inside a worktree is walked once the worktree is found.
 */
function theWorktreesIn(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  if (entries.some((entry) => entry.name === '.git' && entry.isFile())) return [dir]
  return entries.filter((entry) => entry.isDirectory() && entry.name !== '.git').flatMap((entry) => theWorktreesIn(join(dir, entry.name)))
}

/**
 * Why one worktree keeps the folder, or null when it holds nothing of its own. Git is started through the guard of
 * src/config/guarded-git.mjs, so no GIT_* variable of the helper's own run points it at another repository and the
 * repository's config starts no fsmonitor, hook or pager, and with LC_ALL=C, so git's words in the line are English.
 * Even with the guard, git status can start a clean or process filter that the repository chose, which no -c can stop
 * (the guard's header says why), so this check runs only inside the sandbox's container, where the start helper runs,
 * and must not be called on the host. Untracked files are counted whatever the repository's settings say, and ignored
 * files are not.
 */
function whyThisWorktreeKeepsIt(worktree) {
  const git = (...args) => {
    const ran = spawnSync('git', guardedGitArguments(worktree, args, { before: ['--no-optional-locks'] }), {
      env: guardedGitEnvironment({ LC_ALL: 'C' }), encoding: 'utf8', timeout: A_GIT_CALL_MAY_TAKE_MS, stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (ran.error?.code === 'ETIMEDOUT') return { fails: `git ${args.join(' ')} did not answer within ${String(A_GIT_CALL_MAY_TAKE_MS / 1000)} seconds` }
    if (ran.error !== undefined) return { fails: ran.error.message }
    if (ran.status !== 0) {
      const said = ran.stderr.split('\n').find((line) => line.trim() !== '')?.trim()
      return { fails: said ?? `git ${args.join(' ')} ended with ${ran.status === null ? `signal ${String(ran.signal)}` : `exit code ${String(ran.status)}`} and said nothing` }
    }
    return { out: ran.stdout.trim() }
  }
  const cannot = (words) => `git could not answer for the worktree ${worktree}: ${words}`
  const status = git('status', '--porcelain', '--untracked-files=normal')
  if ('fails' in status) return cannot(status.fails)
  const head = git('rev-parse', '--verify', 'HEAD')
  if ('fails' in head) return cannot(head.fails)
  const commit = head.out
  if (status.out !== '') return `the git worktree ${worktree}, at commit ${commit}, holds changes or files nobody committed`
  const refs = git('for-each-ref', '--count=1', '--format=%(refname)', '--contains', commit)
  if ('fails' in refs) return cannot(refs.fails)
  if (refs.out === '') return `the git worktree ${worktree} is at commit ${commit}, which no branch, tag or other ref of its repository holds`
  return null
}
