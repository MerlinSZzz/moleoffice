// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHETHER THE LOGIN PRESS IS INSTALLED ON THIS MACHINE, read once from the host's installation record when the holder
 * starts.
 *
 * The record is ~/.config/mole-office/claude-login-pool.json. The person who keeps the pool tool writes it; nothing in
 * Mole Office writes it, and no setting, door or holder message can name another file or program. The two adapters
 * are built only when all of these hold:
 *   - this is Linux;
 *   - the record is a regular file of this user's, mode 600, with exactly the keys in RECORD_KEYS and version 1;
 *   - the tool is a regular file of this user's, not writable by group or others, with the sha256 the record names;
 *   - python and claude are programs this user may run;
 *   - the pool is ~/.config/mole-office/claude-logins, the folder the tool uses when it is given only HOME, and it is
 *     a folder of this user's with mode 700;
 *   - setpriv and prlimit are at their paths, and this holder's own core limit has been lowered to 0, soft and hard,
 *     since the token passes through its memory.
 * Otherwise both are null, the press answers Unavailable, and `why` says which of these failed. On a machine with no
 * record, which is every machine but the one the pool is on, `why` says there is no record.
 *
 * `claudeCheck` must be in the record and is not read here.
 */
import { execFileSync } from 'node:child_process'
import { accessSync, constants, lstatSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { privatePool } from '../server/lib/sandbox-login-addition/pool.mjs'
import { PRLIMIT, SETPRIV, thePoolToolAdapter, theToolIsAsInstalled } from './private-sandbox-login-pool-tool.mjs'
import { theSetupTokenAdapter } from './private-sandbox-login-setup-token.mjs'

export const INSTALLATION_RECORD = join('.config', 'mole-office', 'claude-login-pool.json')
export const THE_POOL = join('.config', 'mole-office', 'claude-logins')
export const RECORD_KEYS = Object.freeze(['claude', 'claudeCheck', 'pool', 'python', 'tool', 'toolSha256', 'version'])

/**
 * Lower this process's core limit to 0, soft and hard, and read it back.
 * @returns {string | null} why it could not be done, or null when it was
 */
export function lowerThisHoldersCoreLimit() {
  try {
    execFileSync(PRLIMIT, ['--pid', String(process.pid), '--core=0:0'], { stdio: 'ignore', timeout: 5000 })
    const now = execFileSync(PRLIMIT, ['--pid', String(process.pid), '--core', '--raw', '--noheadings', '--output', 'SOFT,HARD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 })
    return now.trim().split(/\s+/).join(' ') === '0 0' ? null : `this holder's core limit reads ${now.trim()} after it was lowered`
  } catch (err) {
    return `this holder's core limit could not be lowered: ${err instanceof Error ? err.message : String(err)}`
  }
}

/** @param {string} path */
const aProgram = (path) => {
  try {
    if (!statSync(path).isFile()) return false
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * @param {{ home?: string, platform?: string, lowerTheCoreLimit?: () => string | null }} [options]
 * @returns {{ adapter: import('./private-sandbox-login.mjs').VerifiedNativeAdapter | null, pool: import('../server/lib/sandbox-login-addition/pool.mjs').PrivatePool | null, why: string | null }}
 */
export function theInstalledLogin({ home = homedir(), platform = process.platform, lowerTheCoreLimit = lowerThisHoldersCoreLimit } = {}) {
  const none = (/** @type {string} */ why) => ({ adapter: null, pool: null, why })
  if (platform !== 'linux') return none('the login press runs only on Linux')
  const path = join(home, INSTALLATION_RECORD)
  let info
  try {
    info = lstatSync(path)
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code
    return none(code === 'ENOENT' ? `there is no installation record at ${path}` : `the installation record at ${path} cannot be read (${String(code)})`)
  }
  if (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600) return none(`the installation record at ${path} is not a file of this user's with mode 600`)
  /** @type {Record<string, unknown>} */
  let record
  try {
    record = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return none(`the installation record at ${path} is not JSON`)
  }
  if (!record || typeof record !== 'object' || Array.isArray(record)) return none(`the installation record at ${path} is not a JSON object`)
  const keys = Object.keys(record).sort()
  if (keys.join(',') !== RECORD_KEYS.join(',')) return none(`the installation record has the keys ${keys.join(', ')}, and not ${RECORD_KEYS.join(', ')}`)
  if (record.version !== 1) return none('the installation record is not version 1')
  const { python, tool, toolSha256, pool, claude } = record
  for (const [name, value] of Object.entries({ python, tool, pool, claude })) {
    if (typeof value !== 'string' || !isAbsolute(value)) return none(`the installation record's ${name} is not an absolute path`)
  }
  if (typeof toolSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(toolSha256)) return none("the installation record's toolSha256 is not 64 hex characters")
  const named = /** @type {{ python: string, tool: string, pool: string, claude: string }} */ ({ python, tool, pool, claude })
  if (!theToolIsAsInstalled(named.tool, toolSha256)) return none(`the tool at ${named.tool} is not a file of this user's that only this user may change, with the sha256 the record names`)
  if (!aProgram(named.python)) return none(`python at ${named.python} is not a program this user may run`)
  if (!aProgram(named.claude)) return none(`claude at ${named.claude} is not a program this user may run`)
  if (named.pool !== join(home, THE_POOL)) return none(`the pool ${named.pool} is not ${join(home, THE_POOL)}, the folder the tool uses when it is given only HOME`)
  let folder
  try {
    folder = lstatSync(named.pool)
  } catch {
    return none(`the pool ${named.pool} is not there`)
  }
  if (!folder.isDirectory() || folder.uid !== process.getuid?.() || (folder.mode & 0o777) !== 0o700) return none(`the pool ${named.pool} is not a folder of this user's with mode 700`)
  for (const program of [SETPRIV, PRLIMIT]) if (!aProgram(program)) return none(`${program} is not a program this user may run`)
  const limit = lowerTheCoreLimit()
  if (limit !== null) return none(limit)
  const tools = thePoolToolAdapter({ python: named.python, tool: named.tool, toolSha256, home })
  return { adapter: theSetupTokenAdapter({ claude: named.claude }), pool: privatePool({ tool: tools }), why: null }
}
