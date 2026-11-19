// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * GIT ON A REPOSITORY A SANDBOXED RUN CAN WRITE, STARTED BY A TOOL ON THE HOST.
 *
 * src/config/guarded-git.mjs says why, and what the guard is. This file starts git with that guard,
 * because nothing under src/ may start a process. A tool on the host that runs git on a repository
 * inside a sandbox folder runs it here.
 *
 * NOTHING HERE COMPARES OR WRITES A FILE IN THE WORK TREE THROUGH GIT. A filter the repository names
 * would run, and no guard can name it in advance. `outsideTheCommit` and `outsideTheCommitInLines`
 * answer what in a work tree is not the commit, from git's lists and the files themselves
 * (src/config/outside-the-commit.mjs).
 * A command that must check files out runs inside the sandbox's own container instead, as
 * `fastForwardInside` does.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, realpathSync, renameSync, rmSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { guardedGitArguments, guardedGitEnvironment } from '../src/config/guarded-git.mjs'
import { whatIsOutsideTheCommit, whatTheIndexHoldsApart } from '../src/config/outside-the-commit.mjs'

/**
 * `workTree` pins the work tree, and `before` holds git's own options such as `--literal-pathspecs`.
 * `fromAFolder` allows the one transport a fetch by path needs. `env` adds a commit's author.
 * @typedef {{ input?: string | Buffer, workTree?: string, before?: string[], env?: Record<string, string>, fromAFolder?: boolean, timeout?: number, maxBuffer?: number }} Guarded
 */

/** @param {Guarded} options */
function theEnvironment(options) {
  return guardedGitEnvironment({ ...(options.fromAFolder ? { GIT_ALLOW_PROTOCOL: 'file' } : {}), ...(options.env ?? {}) })
}

/**
 * GIT STARTS IN THE FOLDER IT READS, as well as being told it with `-C`, so a folder that is not
 * there is a process that could not start, and not an answer from git.
 */

/**
 * Git's standard output as bytes. It throws as execFileSync throws, with git's exit code in `status`
 * and what it said on its error channel in `stderr`.
 * @param {string} directory
 * @param {string[]} args
 * @param {Guarded} [options]
 * @returns {Buffer}
 */
export function guardedGitBytes(directory, args, options = {}) {
  return execFileSync('git', guardedGitArguments(resolve(directory), args, options), {
    cwd: directory,
    env: theEnvironment(options),
    ...(options.input === undefined ? {} : { input: options.input }),
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
  })
}

/**
 * Git's standard output as text, without the line end.
 * @param {string} directory
 * @param {string[]} args
 * @param {Guarded} [options]
 */
export function guardedGit(directory, args, options = {}) {
  return guardedGitBytes(directory, args, options).toString('utf8').trim()
}

/**
 * spawnSync's whole answer, as text, for a caller that reads the exit code itself.
 * @param {string} directory
 * @param {string[]} args
 * @param {Guarded} [options]
 */
export function guardedGitRun(directory, args, options = {}) {
  return spawnSync('git', guardedGitArguments(resolve(directory), args, options), {
    cwd: directory,
    env: theEnvironment(options),
    ...(options.input === undefined ? {} : { input: options.input }),
    encoding: 'utf8',
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
  })
}

/**
 * WHAT ADDRESS GIT IN `repository` WOULD FETCH `folder` FROM, and whether that is the folder itself:
 * `{ address, isTheFolderItself, why }`. `address` is null and `why` is what git said when the address
 * could not be read; otherwise `why` is null.
 *
 * git expands a url.<base>.insteadOf rewrite before it fetches, and it applies the rewrite to an
 * address given by a folder's path too, so a config a sandboxed run can write can make a fetch take
 * commits from another folder. `ls-remote --get-url` answers the expansion without contacting
 * anything, and one function here is what every caller asks.
 * @param {string} repository
 * @param {string} folder
 * @returns {{ address: string | null, isTheFolderItself: boolean, why: string | null }}
 */
export function theAddressGitWouldFetch(repository, folder) {
  const asked = guardedGitRun(repository, ['ls-remote', '--get-url', folder], { timeout: 30_000, maxBuffer: 1024 * 1024 })
  if (asked.status !== 0) {
    const why = String(asked.stderr ?? '').trim() || asked.error?.message || `git exited ${String(asked.status)}`
    return { address: null, isTheFolderItself: false, why }
  }
  const address = String(asked.stdout ?? '').trim()
  return { address, isTheFolderItself: address === folder, why: null }
}

/**
 * What in the work tree at `directory` is not `commit`, read without git comparing a file
 * (src/config/outside-the-commit.mjs). `lines` are as `git status --porcelain` gives them: ` M <path>`
 * for a tracked path whose file is not the commit's, or a staged path the commit does not hold,
 * `M  <path>` for a path staged with other bytes whose file is the commit's again, `?? <path>` for an
 * untracked file, and `?? <folder>/` for a folder git does not track at all, sorted. `notCompared`
 * holds the files git converts on checkout whose bytes are not the committed blob's: nothing here can
 * tell whether they hold work, and none of them is in `lines`.
 * @param {string} directory
 * @param {string} commit
 * @returns {{ lines: string[], notCompared: string[] }}
 */
export function outsideTheCommit(directory, commit) {
  /** @type {import('../src/config/outside-the-commit.mjs').GitReader} */
  const read = (args, options) => guardedGitBytes(directory, args, options ?? {})
  const outside = whatIsOutsideTheCommit(directory, commit, read, new Set(), { folders: true })
  const apart = new Set([...outside.dirty, ...outside.notCompared])
  const staged = whatTheIndexHoldsApart(directory, commit, read).staged.filter((path) => !apart.has(path))
  return {
    lines: [
      ...outside.dirty.map((path) => ` M ${path}`),
      ...staged.map((path) => `M  ${path}`),
      ...outside.untracked.map((path) => `?? ${path}`),
    ].sort(),
    notCompared: outside.notCompared,
  }
}

/**
 * The same, in one sorted text of lines, for a caller that asks only whether the work tree is its
 * commit. A file that could not be compared is ` M <path>` here: its bytes are not the commit's, and
 * nothing here can say that git's conversion explains them. Empty means every file of the commit is
 * there with its committed bytes, the index holds the commit, and every other file is ignored.
 * @param {string} directory
 * @param {string} commit
 */
export function outsideTheCommitInLines(directory, commit) {
  const { lines, notCompared } = outsideTheCommit(directory, commit)
  return [...lines, ...notCompared.map((path) => ` M ${path}`)].sort().join('\n')
}

/**
 * How long one fast-forward inside a container may take before it is stopped. The launcher's wait for
 * another start's refresh of the same clone is worked out from it (tools/sandbox.mjs).
 */
export const A_FAST_FORWARD_INSIDE_MS = 120_000

/**
 * A FAST-FORWARD OF A SANDBOX'S CLONE, RUN INSIDE THAT SANDBOX'S OWN CONTAINER. It writes the files of
 * the work tree, so a filter the clone names runs, and inside the container it runs in the sandbox that
 * chose it. The clone is at the same path inside as on the host. It runs as the container's own user,
 * as every command the launcher starts there does, and it is waited for. Answers spawnSync's answer.
 * @param {string} container
 * @param {string} clone
 * @param {string} commit
 */
export function fastForwardInside(container, clone, commit) {
  return spawnSync('docker', ['exec', '-w', clone, container, 'git', '-C', clone, 'merge', '--quiet', '--ff-only', commit], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: A_FAST_FORWARD_INSIDE_MS,
  })
}

/**
 * THE BARE MIRROR OF A CHECKOUT'S MAIN, BROUGHT FORWARD TO THAT MAIN, and made first when `make` says so and it is not
 * there (item 2f). Run on the host, by the launcher alone. `mirror` is theMainMirrorOf(sandboxes, from)
 * (tools/sandbox-common.mjs), the origin of every sandbox clone made from `from`; no sandbox can write it.
 *
 * `up` makes a missing mirror; an agent's start only brings one forward. A new mirror is made under another name and
 * renamed into place, so two starts at once cannot both make it, and it writes down the real path of the checkout it
 * mirrors as `mole-office.source` in its own config. A mirror that names another checkout is never written.
 *
 * MAIN COMES FROM THE CHECKOUT BY THE PATH THE HOST KNOWS, as refreshMainBeforeRun takes it (tools/sandbox.mjs): the host
 * reads the commit main is at there and fetches that one commit by its hash, after asking git in the mirror whether the
 * path would be rewritten (theAddressGitWouldFetch). The mirror holds main and nothing else, and its main is always the
 * checkout's main, so a main that moved back in the checkout moves back here too. A sandbox's own local main is the
 * sandbox's, and it is only ever moved forward.
 *
 * Answers `{ made, moved, why }`: `made` and `moved` say what was done, and `why` is null when the mirror is at the
 * checkout's main, or else the sentence that says why it is not.
 * @param {string} mirror
 * @param {string} from
 * @param {{ make?: boolean }} [options]
 * @returns {{ made: boolean, moved: boolean, why: string | null }}
 */
export function bringTheMainMirrorForward(mirror, from, { make = false } = {}) {
  /** @param {string} directory @param {string[]} args @param {Guarded} [more] */
  const git = (directory, args, more = {}) => guardedGitRun(directory, args, { timeout: 30_000, maxBuffer: 1024 * 1024, ...more })
  /** @param {{ stderr?: unknown, error?: Error, status: number | null }} asked */
  const said = (asked) => String(asked.stderr ?? '').trim().replaceAll('\n', ' ') || asked.error?.message || `git exited ${String(asked.status)}`
  let made = false
  let source
  try { source = realpathSync(from) } catch { return { made, moved: false, why: `${from}, the checkout it mirrors, is not there` } }
  if (!existsSync(mirror)) {
    if (!make) return { made, moved: false, why: `there is no mirror of the main of ${source} at ${mirror}; up makes it` }
    mkdirSync(dirname(mirror), { recursive: true })
    const making = join(dirname(mirror), `.${basename(mirror)}.${process.pid}.making`)
    const init = git(dirname(mirror), ['init', '--quiet', '--bare', '--initial-branch=main', making])
    const noted = init.status === 0 ? git(making, ['config', 'mole-office.source', source]) : init
    if (noted.status !== 0) {
      rmSync(making, { recursive: true, force: true })
      return { made, moved: false, why: `a mirror could not be made at ${mirror}: ${said(noted)}` }
    }
    try {
      renameSync(making, mirror)
      made = true
    } catch (why) {
      rmSync(making, { recursive: true, force: true })
      if (!existsSync(mirror)) return { made, moved: false, why: `a mirror could not be made at ${mirror}: ${why instanceof Error ? why.message : String(why)}` }
    }
  }
  const recorded = git(mirror, ['config', '--file', join(mirror, 'config'), '--get', 'mole-office.source'])
  const names = recorded.status === 0 ? String(recorded.stdout).trim() : null
  if (names !== source) {
    return { made, moved: false, why: `the mirror ${mirror} names ${names === null ? 'no checkout' : names} as the one it mirrors, not ${source}, so it was left as it is` }
  }
  const upstream = git(source, ['rev-parse', '--verify', '--quiet', 'refs/heads/main^{commit}'])
  if (upstream.status !== 0) return { made, moved: false, why: `main could not be read in ${source}` }
  const next = String(upstream.stdout).trim()
  const now = git(mirror, ['rev-parse', '--verify', '--quiet', 'refs/heads/main^{commit}'])
  if (now.status === 0 && String(now.stdout).trim() === next) return { made, moved: false, why: null }
  const address = theAddressGitWouldFetch(mirror, source)
  if (address.address === null) return { made, moved: false, why: `the address git would fetch ${source} from could not be read in ${mirror}: ${address.why}` }
  if (!address.isTheFolderItself) return { made, moved: false, why: `the config of ${mirror} rewrites the address ${source} to ${address.address}, so nothing was fetched` }
  // THE FIRST FETCH CARRIES ALL OF MAIN'S HISTORY, so it is given ten minutes; later ones carry a few commits.
  const fetched = git(mirror, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', source, `+${next}:refs/heads/main`], { fromAFolder: true, timeout: 600_000 })
  if (fetched.status !== 0) return { made, moved: false, why: `main of ${source} could not be fetched into ${mirror}: ${said(fetched)}` }
  return { made, moved: true, why: null }
}
