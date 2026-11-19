// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PROCESSES: git, a command run in its own process group with a time limit, hashing by path, and the two helpers
 * that read a checkout's package.json and link its node_modules. Part of the merge tool, tools/the-merger.mjs.
 */

import './a-library-is-not-a-program.mjs'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
  statSync,
} from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

import { guardedGitArguments } from '../../src/config/guarded-git.mjs'
import { ABSENT, GIT_IDENTITY, WORKDIR, chosen } from './arguments.mjs'
import { keepForCleanup } from './cleanup.mjs'
import { theProcessAt } from '../../src/config/session-process.mjs'
import { fail, log } from './log-and-state.mjs'
import { checkTheCloneFirst } from './what-a-clone-names.mjs'

// ============================================================================ processes

/** The environment a child gets: this process's, minus git's own steering variables. */
export function cleanEnvironment(extra = {}) {
  const env = { ...process.env, ...extra }
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY']) delete env[name]
  return env
}

function gitSaid(err) {
  const stderr = err && err.stderr ? String(err.stderr).trim() : ''
  return stderr !== '' ? stderr : err instanceof Error ? err.message : String(err)
}

/**
 * WHAT EVERY GIT COMMAND OF A PIN-ONLY RUN, OR OF A RUN THAT CHECKS A RESOLUTION, STARTS WITH. Either works in the lane's
 * root while another entry's run may be working there, so it never starts git's automatic housekeeping (condition 4 of
 * the merge tool's keeper, and the resolution rule's answer 1).
 */
const BEFORE = chosen.pinOnly || chosen.checkResolution ? ['-c', 'gc.auto=0'] : []

/**
 * A REPOSITORY IN THE SANDBOXES FOLDER IS ONE A SANDBOX CAN WRITE: the clones the tool makes in an entry's sandbox
 * folder. Git there starts with the guard's overrides (src/config/guarded-git.mjs), and may reach another repository
 * only through a folder, whatever the clone's config allows: every fetch the tool makes into a clone names a folder.
 * Before every command, the tool reads what the clone names, and runs nothing when it names a program
 * (what-a-clone-names.mjs). The lane's own checkout is the owner's, and git runs there as it always has.
 */
function inASandboxFolder(cwd) {
  if (typeof chosen.sandboxes !== 'string') fail('The merge tool was started with no sandboxes folder, so it cannot tell which repositories a sandbox can write.')
  const path = relative(resolve(chosen.sandboxes), resolve(cwd))
  return path === '' || (path !== '..' && !path.startsWith('../') && !isAbsolute(path))
}

/** What git in a clone a sandbox can write may reach: a folder, and no other transport, and no object fetched lazily. */
export const ONLY_A_FOLDER = { GIT_ALLOW_PROTOCOL: 'file', GIT_NO_LAZY_FETCH: '1' }

/** Git's arguments and the variables it adds in `cwd`, after the check when `cwd` is a clone a sandbox can write. */
function theCommand(cwd, args) {
  if (!inASandboxFolder(cwd)) return { argv: [...BEFORE, '-C', cwd, ...args], added: {} }
  checkTheCloneFirst(cwd)
  return { argv: guardedGitArguments(cwd, args), added: ONLY_A_FOLDER }
}

/** The same check, before the tool starts another tool that runs git on the files of `dir`. */
export function checkBeforeATool(dir) {
  if (inASandboxFolder(dir)) checkTheCloneFirst(dir)
}

/**
 * One git command's stdout, trimmed, or a failure carrying git's own words. `variables` are added to git's environment,
 * under the ones a sandbox's clone adds.
 */
export function git(cwd, args, { variables = {}, ...options } = {}) {
  const { argv, added } = theCommand(cwd, args)
  try {
    return execFileSync('git', argv, {
      env: cleanEnvironment({ ...GIT_IDENTITY, ...variables, ...added }),
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    }).trim()
  } catch (err) {
    fail(`git ${args.join(' ')} in ${cwd} failed: ${gitSaid(err)}`)
  }
}

/** The replay's reader in `cwd` (replayMain, src/shared/merge/landed-history.mjs): git, with the variables it names. */
export const gitIn = (cwd) => (args, variables) => git(cwd, args, { variables })

/** The same, for a command that may fail as an ordinary answer. */
export function tryGit(cwd, args) {
  const { argv, added } = theCommand(cwd, args)
  const result = spawnSync('git', argv, { env: cleanEnvironment({ ...GIT_IDENTITY, ...added }), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  return { ok: result.status === 0, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim() }
}

/** The early conflict probe's git (early-conflicts.mjs): the status and the output untrimmed, for -z fields. */
export function probeGit(cwd, args, variables = {}) {
  const { argv, added } = theCommand(cwd, args)
  return spawnSync('git', argv, { env: cleanEnvironment({ ...variables, ...added }), encoding: 'utf8', timeout: 15000, maxBuffer: 16 * 1024 * 1024 })
}

export function gitBytes(cwd, args) {
  const { argv, added } = theCommand(cwd, args)
  try {
    return execFileSync('git', argv, { env: cleanEnvironment(added), maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (err) {
    fail(`git ${args.join(' ')} in ${cwd} failed: ${gitSaid(err)}`)
  }
}

/** Whether a process of group `pgid` still runs, read as /proc/<pid>/stat says: a zombie has ended. The kernel's own answer counts zombies, which nobody may reap, so the process table is read only when it says something is there. */
function anythingOfTheGroupRuns(pgid) {
  try { process.kill(-pgid, 0) } catch (err) {
    if (err.code === 'ESRCH') return false
    throw err
  }
  return readdirSync('/proc').some((entry) => /^\d+$/u.test(entry) && theProcessAt(Number(entry)).pgid === pgid)
}

/**
 * RUN A COMMAND AS THE LEADER OF ITS OWN PROCESS GROUP, with a time limit, and keep its output in a
 * file under the workdir. Answers the exit code and the file. `nice -n 19` when asked.
 */
export function run(label, command, args, { cwd, env, timeoutMs, nice = true, idleTimeoutMs = null, stoppedFile = null }) {
  const outFile = join(WORKDIR, `${label}.log`)
  const cmd = nice ? 'nice' : command
  const argv = nice ? ['-n', '19', command, ...args] : args
  log(`running ${label}: ${[command, ...args].join(' ')} in ${cwd}`)
  return new Promise((resolveRun) => {
    const out = openSync(outFile, 'w')
    const child = spawn(cmd, argv, { cwd, env, detached: true, stdio: ['ignore', out, out] })
    if (child.pid !== undefined) {
      const started = theProcessAt(child.pid)
      keepForCleanup({ type: 'group', pid: child.pid, startedAt: started.here ? started.startedAt : null })
    }
    let timedOut = false
    let stoppedReason = null
    let escalation = null
    const stop = (reason) => {
      if (stoppedReason !== null) return
      timedOut = true
      stoppedReason = reason
      try { process.kill(-child.pid, 'SIGTERM') } catch (err) {
        if (err.code !== 'ESRCH') throw err
      }
      if (stoppedFile !== null) log(reason)
      if (stoppedFile !== null) escalation = setTimeout(() => {
        try { process.kill(-child.pid, 'SIGKILL') } catch (err) {
          if (err.code !== 'ESRCH') throw err
        }
      }, 30_000)
    }
    const duration = (ms) => ms % 60_000 === 0 ? `${ms / 60_000} minutes` : `${ms} milliseconds`
    const timer = setTimeout(() => stop(stoppedFile === null
      ? `stopped: ${label} reached its time limit`
      : `stopped: ${stoppedFile} reached its limit of ${duration(timeoutMs)}`), timeoutMs)
    let size = 0
    let lastOutput = Date.now()
    // Both stdout and stderr share this file. New bytes count as output, even without a newline.
    const watchdog = idleTimeoutMs === null ? null : setInterval(() => {
      const current = statSync(outFile).size
      if (current !== size) { size = current; lastOutput = Date.now() }
      else if (Date.now() - lastOutput >= idleTimeoutMs) stop(`stopped: ${stoppedFile} printed nothing for ${duration(idleTimeoutMs)}`)
    }, Math.min(1000, Math.max(10, idleTimeoutMs / 10)))
    const clearTimers = () => {
      clearTimeout(timer)
      if (watchdog !== null) clearInterval(watchdog)
      if (escalation !== null) clearTimeout(escalation)
    }
    const answer = (code, signal) => {
      keepForCleanup({ type: 'group-ended', pid: child.pid })
      clearTimers()
      closeSync(out)
      const tail = readFileSync(outFile, 'utf8').split('\n').filter((line) => line.trim() !== '').slice(-12).join('\n')
      resolveRun({ code, signal, timedOut, stoppedReason, outFile, tail })
    }
    // A STOPPED RE-RUN IS ANSWERED ONCE ITS GROUP HAS ENDED (wave 13u round 136), not when its leader has: npm ends at
    // once on SIGTERM while the test it started may still be stopping, and the next re-run must not start beside it.
    // The SIGKILL 30 s after the stop still comes while anything of the group is left.
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      if (watchdog !== null) clearInterval(watchdog)
      if (stoppedFile === null || stoppedReason === null) return answer(code, signal)
      const waiting = setInterval(() => {
        if (anythingOfTheGroupRuns(child.pid)) return
        clearInterval(waiting)
        answer(code, signal)
      }, 50)
    })
    child.on('error', (err) => {
      keepForCleanup({ type: 'group-ended', pid: child.pid })
      clearTimers()
      closeSync(out)
      resolveRun({ code: null, signal: null, timedOut: false, outFile, tail: String(err), error: String(err) })
    })
  })
}

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** sha256 of a file, or null when nothing is there. A symbolic link hashes its target's name, as the seal does. */
export function hashOfPath(path) {
  try {
    const stat = lstatSync(path)
    return sha256(stat.isSymbolicLink() ? readlinkSync(path, { encoding: 'buffer' }) : readFileSync(path))
  } catch (err) {
    if (err && err.code === 'ENOENT') return null
    throw err
  }
}

/** sha256 of the blob at `path` in `commit`, or null when the commit has no such path. */
export function hashAt(repo, commit, path) {
  const probe = tryGit(repo, ['cat-file', '-e', `${commit}:${path}`])
  if (!probe.ok) return null
  return sha256(gitBytes(repo, ['cat-file', 'blob', `${commit}:${path}`]))
}

/** {path: sha256 | "absent"} for each path at `commit`: the content by path the step door reads. */
export function contentAt(repo, commit, paths) {
  return Object.fromEntries([...new Set(paths)].sort().map((path) => [path, hashAt(repo, commit, path) ?? ABSENT]))
}

/**
 * {path: sha256 | "absent"} for each path at `commit`, as contentAt answers, except that nothing that cannot be read is
 * read as absent (wave 13u round 96): a path is absent only where the commit's tree lists no file, and a folder or a file
 * that cannot be read stops the run with git's own words.
 */
export function contentListedAt(repo, commit, paths) {
  const listed = new Set(gitBytes(repo, ['ls-tree', '-r', '-z', '--full-tree', '--name-only', commit]).toString('utf8').split('\0'))
  return Object.fromEntries([...new Set(paths)].sort().map((path) => [path, listed.has(path) ? sha256(gitBytes(repo, ['cat-file', 'blob', `${commit}:${path}`])) : ABSENT]))
}

/**
 * The paths that differ between two commits, with NO rename detection: a rename is a delete and an
 * add, as the seal counts it (src/server/lib/sealed-tip.ts `captureGit`), so the office compares like
 * with like.
 */
export function changedBetween(repo, from, to) {
  return git(repo, ['diff', '--no-renames', '--name-only', '-z', from, to]).split('\0').filter((one) => one !== '')
}

export function packageScripts(dir) {
  const file = join(dir, 'package.json')
  if (!existsSync(file)) return {}
  const scripts = JSON.parse(readFileSync(file, 'utf8')).scripts
  return scripts && typeof scripts === 'object' ? scripts : {}
}

/** Link the main checkout's node_modules into a clone, as the worktree recipe does. */
export function linkNodeModules(root, clone) {
  const from = join(root, 'node_modules')
  const to = join(clone, 'node_modules')
  if (!existsSync(from) || existsSync(to)) return
  symlinkSync(realpathSync(from), to)
}
