// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * GIT ON A REPOSITORY A SANDBOXED RUN CAN WRITE, STARTED SO THAT IT RUNS NO PROGRAM THAT REPOSITORY CHOSE.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------------------------
 *
 * A sandboxed run can write its repository's config, its hooks and its attributes. Git reads all
 * three, and several settings name a program that git then starts: core.fsmonitor, core.hooksPath
 * and the hooks folder, a diff driver's textconv, diff.external, core.pager, core.editor when a
 * rebase goes on after a conflict, gpg.program to sign a commit or to check a signature,
 * core.alternateRefsCommand when a shared clone fetches, a remote's uploadpack and its transport
 * when a fetch names that remote, and the transport of a promisor remote when an object is missing. A git command the office or a host tool starts on that repository
 * would run that program on the host, as the owner's user, outside the sandbox.
 *
 * ---------------------------------------------------------------------------------------------
 * THE GUARD, IN THREE PARTS
 * ---------------------------------------------------------------------------------------------
 *
 * 1. `guardedGitEnvironment` is this process's environment with every `GIT_` variable taken out
 *    but GIT_TRACE, and every variable that names a pager, an editor or an askpass program. It adds
 *    back no system config, an empty global config, no lazy fetch and no transport. A caller that
 *    must fetch from a folder passes `GIT_ALLOW_PROTOCOL: 'file'`. GIT_TRACE names where git writes
 *    the commands it runs; it starts nothing, and a test reads it to see what ran.
 * 2. `GUARDED_GIT_OPTIONS` go before the command. They turn off the fsmonitor, the hooks, the
 *    pager, the editor, signing and signature checks, automatic housekeeping and replace refs, and
 *    name `true` as the command that lists a shared clone's borrowed refs. A `-c` on the command
 *    line wins over the same key in the repository's config. An editor of `:` is git's own word
 *    for none.
 * 3. `guardedGitArguments` puts them in front, and adds `--no-ext-diff --no-textconv` to every
 *    diff, diff-tree, log and show. Every fetch gets git's own upload-pack, whatever the remote's
 *    config names, and leaves submodules alone, whose config is theirs.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THE GUARD CANNOT STOP, AND SO WHAT IS NEVER RUN THIS WAY
 * ---------------------------------------------------------------------------------------------
 *
 * A clean, smudge or process filter. The repository chooses the filter's name, so no `-c` can
 * name it in advance. Git runs it whenever it compares or writes a file in the work tree: `diff`
 * against HEAD or the index, `status`, `checkout`, `merge`, `rebase`, `worktree add`. Such a
 * command is never run on the host on a repository a sandboxed run can write. It runs inside that
 * sandbox's container, or the office compares git's objects with the files itself.
 *
 * Measured with git 2.43 on a repository armed with every setting above, and kept as a test in
 * tests/no-git-read-runs-a-program-the-repository-chose.test.ts: with this guard, rev-parse,
 * symbolic-ref, for-each-ref, merge-base, ls-tree, cat-file, rev-list, diff and diff-tree between
 * two commits, log -p, show, patch-id, check-attr --cached, ls-files and ls-files --others ran
 * nothing. Without it, ls-files --others ran the fsmonitor, and diff -U0 and log -p ran the
 * process filter. A fetch into a shared clone ran core.alternateRefsCommand, a commit ran
 * gpg.program, and a rebase that went on after a conflict ran core.editor. With the overrides
 * and the environment but without `--upload-pack`, a fetch from a named remote ran that remote's
 * uploadpack; an ext:: address and a remote's vcs helper were refused by GIT_ALLOW_PROTOCOL.
 *
 * GIT_NO_LAZY_FETCH is honoured by git with the security fixes of April 2024. An older git
 * ignores it; GIT_ALLOW_PROTOCOL still refuses every transport there, as it does on every git.
 */

import { spawnSync } from 'node:child_process'

/** Variables outside git's own that name a program git could start. */
const NAMES_A_PROGRAM = ['PAGER', 'EDITOR', 'VISUAL', 'SSH_ASKPASS']

/**
 * The environment for git on a repository a sandboxed run can write. `extra` is added last, for a
 * commit's author or `GIT_ALLOW_PROTOCOL: 'file'`.
 * @param {Record<string, string>} [extra]
 * @returns {Record<string, string>}
 */
export function guardedGitEnvironment(extra = {}) {
  /** @type {Record<string, string>} */
  const env = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined || (name.startsWith('GIT_') && name !== 'GIT_TRACE') || NAMES_A_PROGRAM.includes(name)) continue
    env[name] = value
  }
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_NO_LAZY_FETCH: '1',
    GIT_ALLOW_PROTOCOL: '',
    GIT_TERMINAL_PROMPT: '0',
    ...extra,
  }
}

/** What goes before every command. */
export const GUARDED_GIT_OPTIONS = Object.freeze([
  '--no-pager',
  '--no-replace-objects',
  '-c', 'core.fsmonitor=false',
  '-c', 'core.hooksPath=/dev/null',
  '-c', 'core.editor=:',
  '-c', 'core.alternateRefsCommand=true',
  '-c', 'log.showSignature=false',
  '-c', 'commit.gpgSign=false',
  '-c', 'merge.verifySignatures=false',
  '-c', 'gc.auto=0',
  '-c', 'maintenance.auto=false',
])

/** The commands that can show a diff, and so could start a textconv or an external diff. */
const SHOWS_A_DIFF = new Set(['diff', 'diff-tree', 'log', 'show'])

/** What follows every fetch: the remote's uploadpack setting names a program, and a submodule has its own config. */
const A_FETCH = ['--upload-pack=git-upload-pack', '--no-recurse-submodules']

/**
 * The whole argument list for `git`: the guard, `-C <directory>`, the work tree when one is
 * pinned, then the command with `--no-ext-diff --no-textconv` after it when it can show a diff,
 * or with git's own upload-pack and no submodules when it is a fetch.
 * `before` holds other options of git's own, such as `--literal-pathspecs`.
 * A pinned work tree is the folder the caller means, whatever core.worktree in the repository says.
 * @param {string} directory
 * @param {string[]} args
 * @param {{ workTree?: string, before?: string[] }} [options]
 * @returns {string[]}
 */
export function guardedGitArguments(directory, args, options = {}) {
  const [command, ...rest] = args
  if (command === undefined) throw new Error('git was not started, because no command was named.')
  return [
    ...GUARDED_GIT_OPTIONS,
    ...(options.before ?? []),
    '-C', directory,
    ...(options.workTree === undefined ? [] : [`--work-tree=${options.workTree}`]),
    command,
    ...(SHOWS_A_DIFF.has(command) ? ['--no-ext-diff', '--no-textconv'] : []),
    ...(command === 'fetch' ? A_FETCH : []),
    ...rest,
  ]
}

/**
 * WHAT GIT SAID IN ONE FOLDER, run with the guard above, and how it ended.
 *
 * The rules writer asks here whether git tracks the rules file it would write (src/worker/rules.ts,
 * message `sJlcSoK29PeV` item 3). It is here, in `src/config`, because the server loads
 * src/worker/rules.ts as well as the worker, and both programs may load this folder;
 * src/worker/runtimes/os.ts may start a process too, but the server does not load it
 * (tests/a-program-is-judged-on-the-files-it-is-built-from.test.ts). The guard is used because git
 * started from this file is always guarded, so no reader has to work out whether a sandboxed run
 * could have written that folder's repository.
 *
 * It does not throw when git fails. `git ls-files` in a folder that is not a checkout exits 128 and
 * says so, which is an answer, so the caller reads `status` and `stderr` and decides what they mean.
 * Git's own complaint is captured, never printed: a bare "fatal: not a git repository" on the
 * caller's stderr would read as a fault. When git could not be started at all, or was stopped at the
 * time limit, `status` is null and `stderr` holds Node's reason.
 *
 * GIT IS STARTED WITH LC_ALL=C, whatever language the caller has (message `g6vhmm6Dqobr`, answer
 * 4). The caller reads git's words, and the rules writer reads "not a git repository" in English.
 * Git can print its words in the caller's language, and LC_ALL=C keeps them English. It is set here
 * and not in `guardedGitEnvironment`, so every other git the guard starts keeps the caller's language.
 * @param {string} directory
 * @param {string[]} args
 * @param {number} timeoutMs
 * @returns {{ status: number | null, stdout: string, stderr: string }}
 */
export function whatGuardedGitSays(directory, args, timeoutMs) {
  const ran = spawnSync('git', guardedGitArguments(directory, args), {
    env: guardedGitEnvironment({ LC_ALL: 'C' }),
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const printed = typeof ran.stderr === 'string' ? ran.stderr : ''
  return {
    status: ran.status,
    stdout: typeof ran.stdout === 'string' ? ran.stdout : '',
    stderr: printed !== '' ? printed : (ran.error?.message ?? ''),
  }
}
