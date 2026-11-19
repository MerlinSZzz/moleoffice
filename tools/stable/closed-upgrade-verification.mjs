// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Strict external verifier contract. The stable transaction alone owns processes, closure and recovery. */
import { constants, accessSync, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

const refuse = message => { throw new Error(`Closed verification: ${message}`) }
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
function exact(value, keys, label) {
  if (!object(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) refuse(`${label} must hold exactly ${keys.join(', ')}.`)
}

/** The phases a verifier of the list can run in, and the word its argv holds for its new folder (criteria, items 28 and 31, (b)). */
export const VERIFIER_PHASES = Object.freeze(['target', 'recovery'])
export const THE_FOLDER_WORD = '{folder}'
const names = list => Array.isArray(list) && list.length > 0 && list.every(name => typeof name === 'string' && name.trim()) && new Set(list).size === list.length
const quoted = list => list.map(name => JSON.stringify(name)).join(', ')

/** A literal argv whose first word is a canonical absolute executable file. */
function literalCommand(command, label) {
  if (!Array.isArray(command) || !command.length || command.some(word => typeof word !== 'string' || word.includes('\0'))) refuse(`${label} must be an executable and literal string arguments.`)
  const executable = command[0]
  try {
    if (!isAbsolute(executable) || resolve(executable) !== executable || realpathSync(executable) !== executable || !lstatSync(executable).isFile()) refuse(`${label} must start with a canonical absolute executable file.`)
    accessSync(executable, constants.X_OK)
  } catch (error) { refuse(`verifier executable is unavailable: ${error.message}`) }
}

export function validateClosedVerification(value) {
  const naming = object(value) ? ['command', 'verifiers'].filter(key => Object.hasOwn(value, key)) : []
  if (object(value) && naming.length !== 1) refuse('configuration must name exactly one of command and verifiers.')
  exact(value, [naming[0] ?? 'command', 'timeoutMs', 'checks', 'abortDeadlineMs', 'maxClosedMs'], 'configuration')
  if (naming[0] === 'command') literalCommand(value.command, 'command')
  if (!Number.isSafeInteger(value.timeoutMs) || value.timeoutMs < 1 || value.timeoutMs > 1_800_000) refuse('timeoutMs must be an integer from 1 to 1800000.')
  // The two limits on how long the office stays closed. Neither has a default (upgrade-stable.criteria.md, item 15 (a)).
  for (const key of ['abortDeadlineMs', 'maxClosedMs']) if (!Number.isSafeInteger(value[key]) || value[key] < 1 || value[key] > 86_400_000) refuse(`${key} must be an integer from 1 to 86400000.`)
  if (value.abortDeadlineMs >= value.maxClosedMs) refuse('abortDeadlineMs must be less than maxClosedMs.')
  if (!names(value.checks)) refuse('checks must name a nonempty unique list of nonblank checks.')
  if (naming[0] === 'verifiers') validateTheVerifiers(value.verifiers, value.checks)
}

/**
 * SEVERAL VERIFIERS. Each entry answers its own checks in the phases it names. Each check is answered by exactly one
 * entry, and that entry runs in the target phase. At least one entry runs in the recovery phase.
 */
function validateTheVerifiers(verifiers, checks) {
  if (!Array.isArray(verifiers) || !verifiers.length) refuse('verifiers must be a nonempty list.')
  const answered = new Map()
  verifiers.forEach((entry, n) => {
    const label = `verifiers[${n}]`
    if (!object(entry) || !['command', 'checks', 'phases'].every(key => Object.hasOwn(entry, key)) || Object.keys(entry).some(key => !['command', 'checks', 'phases', 'prepare'].includes(key))) refuse(`${label} must hold command, checks and phases, and may hold prepare.`)
    for (const key of ['command', 'prepare'].filter(key => Object.hasOwn(entry, key))) {
      literalCommand(entry[key], `${label}.${key}`)
      // A word with more around {folder} would be passed on as it is written.
      const word = entry[key].find(word => word.includes(THE_FOLDER_WORD) && word !== THE_FOLDER_WORD)
      if (word !== undefined) refuse(`${label}.${key} holds ${JSON.stringify(word)}; ${THE_FOLDER_WORD} must be a word of its own.`)
    }
    if (!names(entry.checks)) refuse(`${label}.checks must name a nonempty unique list of nonblank checks.`)
    if (!Array.isArray(entry.phases) || !entry.phases.length || entry.phases.some(phase => !VERIFIER_PHASES.includes(phase)) || new Set(entry.phases).size !== entry.phases.length) refuse(`${label}.phases must name target, recovery or both, each once.`)
    for (const name of entry.checks) {
      if (answered.has(name)) refuse(`the check ${JSON.stringify(name)} is in two verifiers.`)
      answered.set(name, entry)
    }
  })
  const unnamed = [...answered.keys()].filter(name => !checks.includes(name))
  if (unnamed.length) refuse(`the verifiers answer ${quoted(unnamed)}, which checks does not name.`)
  const unanswered = checks.filter(name => !answered.get(name)?.phases.includes('target'))
  if (unanswered.length) refuse(`no verifier that runs in the target phase answers ${quoted(unanswered)}.`)
  if (!verifiers.some(entry => entry.phases.includes('recovery'))) refuse('no verifier runs in the recovery phase, so a rollback would open the old version with nothing checked.')
}

/** Never reuse output: each invocation receives a new private directory and an absent result path. */
export function readClosedVerificationResult(path, request) {
  let fd
  try {
    if (!lstatSync(path).isFile()) refuse('result must be an ordinary file.')
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const s = fstatSync(fd)
    if (!s.isFile() || s.nlink !== 1 || s.uid !== process.getuid() || (s.mode & 0o077) || s.size === 0 || s.size > 65_536) refuse('result must be a private ordinary file of at most 65536 bytes.')
    const value = JSON.parse(readFileSync(fd, 'utf8'))
    exact(value, ['version', 'phase', 'commit', 'stateSha256', 'checks'], 'result')
    for (const key of ['version', 'phase', 'commit', 'stateSha256']) if (value[key] !== request[key]) refuse(`result ${key} does not match this frozen request.`)
    exact(value.checks, request.checks, 'result checks')
    if (request.checks.some(name => value.checks[name] !== true)) refuse('every configured check must be boolean true.')
    return value
  } catch (error) { refuse(`verifier result refused: ${error.message}`) }
  finally { if (fd !== undefined) closeSync(fd) }
}
