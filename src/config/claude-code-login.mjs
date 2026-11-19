// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHETHER A CLAUDE CODE COMMAND HAS A LOGIN, read from the environment it will run with. Acceptance finding
 * 47 (report EnJvvsDTF_Dx, block f-47), on a decision of 23 September 2026 (message Pjv4iDbW1PpZ).
 *
 * Claude Code takes its own login, CLAUDE_CODE_OAUTH_TOKEN, out of every command its Bash tool runs. So a
 * Claude Code worker started from inside a Claude Code session starts logged out: it prints "Not logged in"
 * and dies. tools/sandbox-start.mjs asks this before starting one, and refuses rather than start it.
 *
 * A login is any of the variables Claude Code signs in with, or the credentials file /login leaves in the
 * folder Claude Code keeps its settings in. Only whether each is set is looked at: nothing is printed or kept.
 */
import { existsSync } from 'node:fs'
import { THIS_PLATFORM, thePathsOf, theHomeNamedIn } from './the-paths-of-a-system.mjs'

import { PAID_BY_THE_LOGIN_IN, RECEIPT_NOT_REPORTED } from './usage.mjs'

/** The variables Claude Code signs in with, any one of which is a login or says where one is. */
export const CLAUDE_CODE_LOGINS = Object.freeze(['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX'])

/**
 * Where Claude Code keeps a login it was given by /login, for a command with this environment: in
 * CLAUDE_CONFIG_DIR when that is set, and otherwise in ~/.claude. Null when there is no home to hold one.
 * The home is HOME, and on Windows USERPROFILE, because Windows usually sets no HOME (`theHomeNamedIn`).
 * @param {Record<string, string | undefined>} env
 * @param {string} [platform] a value of `process.platform`, this system's unless a test names another
 * @returns {string | null}
 */
export function theCredentialsFile(env, platform = THIS_PLATFORM) {
  const { join } = thePathsOf(platform)
  const home = theHomeNamedIn(env, platform)
  const set = (/** @type {string} */ name) => typeof env[name] === 'string' && env[name] !== ''
  const folder = set('CLAUDE_CONFIG_DIR') ? String(env['CLAUDE_CONFIG_DIR']) : home !== null ? join(home, '.claude') : null
  return folder === null ? null : join(folder, '.credentials.json')
}

/**
 * Whether a Claude Code command with this environment has any login at all.
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function aClaudeCodeLogin(env) {
  if (CLAUDE_CODE_LOGINS.some((name) => typeof env[name] === 'string' && env[name] !== '')) return true
  const file = theCredentialsFile(env)
  return file !== null && existsSync(file)
}

/**
 * WHICH LOGIN A CLAUDE CODE COMMAND WITH THIS ENVIRONMENT RAN UNDER, for its usage receipt's `paidBy`.
 *
 * The envelope does not say whose account paid, so this names the login by where it came from, never an account: the
 * variable it was in, or the credentials file /login left, named from the home folder on. Only the name is kept;
 * nothing of the login is read.
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function theLoginThatPaid(env) {
  const named = CLAUDE_CODE_LOGINS.find((name) => typeof env[name] === 'string' && env[name] !== '')
  if (named !== undefined) return `${PAID_BY_THE_LOGIN_IN}${named}`
  const file = theCredentialsFile(env)
  if (file === null || !existsSync(file)) return RECEIPT_NOT_REPORTED
  // NAMED WITHOUT THE HOME FOLDER (review message DLqviJ8nr3yH): a full path carries the machine's user name
  // onto every receipt and every page that shows one, and the owner's rule is that user names and addresses do not go out.
  const set = typeof env['CLAUDE_CONFIG_DIR'] === 'string' && env['CLAUDE_CONFIG_DIR'] !== ''
  return `${PAID_BY_THE_LOGIN_IN}${set ? '$CLAUDE_CONFIG_DIR' : '~/.claude'}/.credentials.json`
}
