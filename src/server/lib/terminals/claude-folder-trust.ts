// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomBytes } from 'node:crypto'
import { constants, closeSync, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync, type Stats } from 'node:fs'
import { dirname, isAbsolute, join, parse, resolve } from 'node:path'
import { theHomeFolderSpellings } from '../../../config/start-folder.mjs'
import { whereTheHomesAre } from '../../../config/files-area.mjs'
import { theClaudeTrustEdit } from './claude-trust-json.ts'

/**
 * Claude Code 2.1.281's embedded program: ct/cGn choose the global file (legacy .config.json
 * first); _b writes projects[path].hasTrustDialogAccepted. xo uses proper-lockfile's mkdir
 * <file>.lock, with its default ten-second stale limit. tv publishes a flushed sibling temp
 * with rename. This writer uses that same lock, never steals it, and never truncates in place.
 * The synchronous section has a one-second limit, below both lock staleness and native retries.
 * https://code.claude.com/docs/en/settings describes this file as global per-project state.
 */
const MAX_SETTINGS_BYTES = 4 * 1024 * 1024
export const MAX_LOCKED_MS = 1_000

/** The refusal when the lock folder is no longer the one this write made, `heldMs` after it was made. */
export function theLockWasReplaced(heldMs: number): string {
  return `The Claude settings lock is no longer the folder this write made, ${Math.round(heldMs)} ms after it was made.`
}

/** The refusal when the lock has been held `heldMs`, at or past MAX_LOCKED_MS. */
export function theLockWasHeldTooLong(heldMs: number): string {
  return `The Claude settings lock was held ${Math.round(heldMs)} ms, which is past its safe writing time of ${MAX_LOCKED_MS} ms.`
}

function maybeStat(path: string): Stats | null {
  try { return lstatSync(path) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function sameFile(a: Stats, b: Stats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs
}

function safeDirectory(path: string): void {
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path ||
      (process.getuid !== undefined && stat.uid !== process.getuid()) || (stat.mode & 0o022) !== 0) {
    throw new Error('The Claude settings directory is not a private, directly addressed directory.')
  }
}

function settingsFile(env: NodeJS.ProcessEnv): string {
  if (!env['HOME'] || !isAbsolute(env['HOME'])) throw new Error('The terminal has no absolute home folder for Claude settings.')
  const home = resolve(env['HOME'])
  safeDirectory(home)
  const configured = env['CLAUDE_CONFIG_DIR']
  if (configured && !isAbsolute(configured)) throw new Error('The Claude settings directory is not absolute.')
  const config = configured ? resolve(configured) : join(home, '.claude')
  const legacy = join(config, '.config.json')
  if (maybeStat(config) !== null) {
    safeDirectory(config)
    if (maybeStat(legacy) !== null) return legacy
  }
  const parent = configured ? config : home
  safeDirectory(parent)
  return join(parent, '.claude.json')
}

function recordedFolder(folder: string, recorded: string | null, env: NodeJS.ProcessEnv): string {
  if (recorded === null || !isAbsolute(recorded) || !isAbsolute(folder) || resolve(recorded) !== resolve(folder)) {
    throw new Error('The folder to open is not the agent\'s recorded start folder.')
  }
  const actual = realpathSync(folder)
  if (!statSync(actual).isDirectory()) throw new Error('The recorded start folder is not an existing directory.')
  const homes = theHomeFolderSpellings(undefined, env['HOME'], env)
  const homePaths = homes.flatMap((home) => {
    try { return [resolve(home), realpathSync(home)] } catch { return [resolve(home)] }
  })
  if (actual === parse(actual).root || homePaths.includes(actual) || actual === whereTheHomesAre(undefined, env).under) {
    throw new Error('A root or home folder cannot be trusted for an agent terminal.')
  }
  // Claude keys repository trust on its root and linked-worktree trust on the main checkout.
  // Those folders cannot be substituted for the one the agent was actually given.
  for (let directory = actual; ; directory = dirname(directory)) {
    const git = maybeStat(join(directory, '.git'))
    if (git !== null) {
      if (directory !== actual) {
        throw new Error('Claude Code would apply this trust to a different repository folder.')
      }
      if (!git.isDirectory() || git.isSymbolicLink()) {
        throw new Error('The native trust scope of this repository metadata cannot be safely established.')
      }
      break
    }
    if (directory === dirname(directory)) break
  }
  // Use the real directory itself, never its repository root or a parent of the start folder.
  return actual
}

/** Fail before any holder call or run write. env must be the environment the terminal will receive. */
export function trustTheRecordedClaudeFolder(input: { folder: string; recordedFolder: string | null | (() => string | null); env: NodeJS.ProcessEnv }): string {
  const currentFolder = () => recordedFolder(input.folder, typeof input.recordedFolder === 'function' ? input.recordedFolder() : input.recordedFolder, input.env)
  const folder = currentFolder()
  const file = settingsFile(input.env), parent = dirname(file), lock = file + '.lock'
  // mkdir is the native writer's mutex. An existing lock, even an old one, is a refusal here.
  mkdirSync(lock, { mode: 0o700 })
  const held = lstatSync(lock), started = performance.now()
  let temp: string | null = null
  const stillLocked = () => {
    const now = lstatSync(lock), heldMs = performance.now() - started
    if (!now.isDirectory() || !sameFile(held, now)) throw new Error(theLockWasReplaced(heldMs))
    if (heldMs >= MAX_LOCKED_MS) throw new Error(theLockWasHeldTooLong(heldMs))
  }
  try {
    safeDirectory(parent)
    const before = maybeStat(file)
    let original: Buffer = Buffer.from('{}')
    if (before !== null) {
      if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > MAX_SETTINGS_BYTES || (before.mode & 0o022) !== 0 ||
          (process.getuid !== undefined && before.uid !== process.getuid())) {
        throw new Error('The Claude settings file is not a safely editable regular file.')
      }
      const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      try {
        if (!sameFile(before, fstatSync(fd))) throw new Error('The Claude settings file changed before it was read.')
        original = readFileSync(fd)
      } finally { closeSync(fd) }
    }
    const edited = theClaudeTrustEdit(original, folder)
    if (edited === null) {
      safeDirectory(parent)
      if (currentFolder() !== folder) throw new Error('The recorded start folder changed while trust was read.')
      stillLocked()
      return folder
    }
    const staging = file + '.tmp.' + process.pid + '.' + randomBytes(6).toString('hex')
    const fd = openSync(staging, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    temp = staging
    try {
      writeFileSync(fd, edited)
      fchmodSync(fd, before === null ? 0o600 : before.mode & 0o777)
      fsyncSync(fd)
    } finally { closeSync(fd) }
    safeDirectory(parent)
    // Also detect writers that do not honor the lock, and path/symlink replacement during the edit.
    const current = maybeStat(file)
    if (before === null ? current !== null : current === null || !sameFile(before, current) || !readFileSync(file).equals(original)) {
      throw new Error('The Claude settings file changed while trust was being prepared.')
    }
    if (currentFolder() !== folder) {
      throw new Error('The recorded start folder changed while trust was being prepared.')
    }
    stillLocked()
    renameSync(temp, file)
    temp = null
    const directory = openSync(parent, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    try { fsyncSync(directory) } finally { closeSync(directory) }
    stillLocked()
    return folder
  } finally {
    if (temp !== null) unlinkSync(temp)
    const currentLock = maybeStat(lock)
    if (currentLock !== null && sameFile(held, currentLock)) rmdirSync(lock)
  }
}
