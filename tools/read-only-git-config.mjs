// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
import { spawnSync } from 'node:child_process'
import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

const CONFIG_TIMEOUT_MS = 15_000
const CONFIG_MAX_BUFFER = 64 * 1024
/**
 * THE INDEX QUERY'S OWN BOUND. It prints a 6-digit object mode and a newline, 7 bytes, for each tracked file, so its output
 * grows with the tree, while the other queries print a root or a few key names. On 1 Nov 2026 main tracked 9,366 files
 * (65,562 bytes), past the 64 KiB the others keep, and every receipt firing and stable upgrade read refused with ENOBUFS.
 * 16 MiB holds the modes of about 2.4 million files.
 */
const INDEX_MAX_BUFFER = 16 * 1024 * 1024
const CHECKOUT_READ_CONFIG_PATTERN = String.raw`^(filter\..*\.(clean|process)|remote\..*\.(promisor|partialclonefilter)|extensions\.partialclone)$`
const FILTER_KEY = /^filter\..+\.(?:clean|process)$/i
const PARTIAL_CLONE_KEY = /^(?:remote\..+\.(?:promisor|partialclonefilter)|extensions\.partialclone)$/i
const CHECKOUT_READ_KEY = /^(?:filter\..+\.(?:clean|process)|remote\..+\.(?:promisor|partialclonefilter)|extensions\.partialclone)$/i

/** @param {string} message @returns {never} */
function refuse(message) {
  throw new Error(`Read-only Git config refused: ${message}`)
}

/** @param {string} repository */
function requireCanonicalRepository(repository) {
  if (typeof repository !== 'string' || !isAbsolute(repository) || resolve(repository) !== repository) {
    refuse('the repository must be an absolute canonical repository root.')
  }
  let canonicalPath = ''
  let isDirectory = false
  try {
    canonicalPath = realpathSync(repository)
    isDirectory = statSync(repository).isDirectory()
  } catch {
    refuse('the repository path is inaccessible.')
  }
  if (canonicalPath !== repository || !isDirectory) refuse('the repository must be an existing canonical repository root.')
}

/**
 * @param {string} repository
 * @param {string[]} args
 * @param {string} purpose
 * @param {NodeJS.ProcessEnv} env
 * @param {number} [maxBuffer] the most output it reads; the index query passes its own
 */
function readGit(repository, args, purpose, env, maxBuffer = CONFIG_MAX_BUFFER) {
  let result
  try {
    result = spawnSync('git', [
      '--no-pager',
      '-c', 'core.hooksPath=/dev/null',
      '-c', 'core.fsmonitor=false',
      '-c', 'gc.auto=0',
      '-c', 'maintenance.auto=false',
      '-C', repository,
      ...args,
    ], {
      env,
      encoding: 'utf8',
      timeout: CONFIG_TIMEOUT_MS,
      maxBuffer,
    })
  } catch {
    refuse(`Git ${purpose} could not be started.`)
  }
  if (result.error) {
    const code = 'code' in result.error ? String(result.error.code) : 'unknown spawn error'
    refuse(`Git ${purpose} could not be started (${code}).`)
  }
  if (result.signal) refuse(`Git ${purpose} was interrupted by ${result.signal}.`)
  if (result.status === null) refuse(`Git ${purpose} ended without an exit status.`)
  if (result.stderr !== '') refuse(`Git ${purpose} did not complete without errors.`)
  return result
}

/**
 * Require a complete local Git configuration read with no clean or process filters.
 * Git's --name-only option keeps filter command values out of the result.
 * @param {string} repository
 */
export function requireReadOnlyGitConfig(repository) {
  requireCanonicalRepository(repository)

  const path = process.env.PATH
  if (typeof path !== 'string' || path === '') refuse('PATH is unavailable, so Git configuration is unknown.')

  // An allowlist prevents inherited Git configuration variables from changing what this reads.
  const env = {
    PATH: path,
    HOME: '/nonexistent',
    LANG: 'C',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_TERMINAL_PROMPT: '0',
  }

  const root = readGit(repository, ['rev-parse', '--show-toplevel'], 'repository-root query', env)
  if (root.status !== 0 || root.stdout !== `${repository}\n`) {
    refuse('Git could not confirm the canonical repository root; configuration is unknown.')
  }

  // Git follows local include and includeIf directives by default. System and global config are
  // excluded above, so a matching key is local to this repository or one of its includes.
  const config = readGit(repository, ['config', '--includes', '--name-only', '--get-regexp', CHECKOUT_READ_CONFIG_PATTERN], 'config query', env)
  /** @type {string[]} */
  let keys = []
  if (config.status === 1) {
    if (config.stdout !== '') refuse('Git config returned output with exit status 1; configuration is unknown.')
  } else {
    if (config.status !== 0) refuse(`Git config returned unexpected exit status ${config.status}; configuration is unknown.`)

    if (!config.stdout.endsWith('\n')) refuse('Git config returned malformed key names; configuration is unknown.')
    keys = config.stdout.slice(0, -1).split('\n')
    if (keys.length === 0 || keys.some((key) => !CHECKOUT_READ_KEY.test(key))) {
      refuse('Git config returned malformed key names; configuration is unknown.')
    }
  }

  if (keys.length !== 0) {
    /** @type {string[]} */
    const reasons = []
    if (keys.some((key) => FILTER_KEY.test(key))) reasons.push('clean/process filters')
    if (keys.some((key) => PARTIAL_CLONE_KEY.test(key))) reasons.push('partial-clone lazy fetching')
    refuse(`configured ${reasons.join(' and ')} keys ${keys.join(', ')} are incompatible with a read-only checkout check.`)
  }

  // A parent status read can enter a tracked child repository and run that repository's filters.
  // Read only compact index modes here; do not inspect or start a submodule.
  const index = readGit(repository, ['ls-files', '--format=%(objectmode)'], 'index metadata query', env, INDEX_MAX_BUFFER)
  if (index.status !== 0) refuse('Git could not read bounded index metadata; configuration is unknown.')
  if (index.stdout !== '') {
    if (!index.stdout.endsWith('\n')) refuse('Git returned malformed index object modes; configuration is unknown.')
    const modes = index.stdout.slice(0, -1).split('\n')
    if (modes.some((mode) => !/^(?:100644|100755|120000|160000)$/.test(mode))) {
      refuse('Git returned unexpected index object modes; configuration is unknown.')
    }
    if (modes.includes('160000')) refuse('tracked Git submodules can run commands during a checkout read.')
  }
}
