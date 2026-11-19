// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CLAUDE CODE COMMAND HAS A LOGIN, OR THE LAUNCHER DOES NOT START IT. Acceptance finding 47 (report
 * EnJvvsDTF_Dx, block f-47), on the secretary's decision of 23 September 2026 (message Pjv4iDbW1PpZ).
 *
 * Claude Code takes CLAUDE_CODE_OAUTH_TOKEN out of every command its Bash tool runs. A Claude Code worker
 * started from inside a Claude Code session therefore starts logged out, prints "Not logged in" and is
 * marked crashed. tools/sandbox-start.mjs asks src/config/claude-code-login.mjs first and refuses instead;
 * tests/sandbox-launcher.test.ts proves the refusal end to end. This file proves what counts as a login,
 * so that a sandbox that signs in another way is never refused.
 *
 * MUTATION PROOF, 23 September 2026, each alone:
 *   - the variables left unread: the case of the variables goes red;
 *   - the credentials file left unread: the ~/.claude case and the CLAUDE_CONFIG_DIR case go red;
 *   - CLAUDE_CONFIG_DIR ignored in favour of ~/.claude: the CLAUDE_CONFIG_DIR case goes red.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { CLAUDE_CODE_LOGINS, aClaudeCodeLogin, theCredentialsFile } from '../src/config/claude-code-login.mjs'

const scratch = mkdtempSync(join(tmpdir(), 'a-claude-code-login-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/** A home, with a credentials file in `.claude` when asked for. */
function aHome(withCredentials: boolean): string {
  const home = mkdtempSync(join(scratch, 'home-'))
  if (withCredentials) {
    mkdirSync(join(home, '.claude'), { recursive: true })
    writeFileSync(join(home, '.claude', '.credentials.json'), '{}', { mode: 0o600 })
  }
  return home
}

describe('what counts as a Claude Code login', () => {
  it('is any one of the variables Claude Code signs in with, set to something', () => {
    for (const name of CLAUDE_CODE_LOGINS) expect(aClaudeCodeLogin({ [name]: 'not-a-real-value' }), name).toBe(true)
  })

  it('is not a variable set to nothing', () => {
    for (const name of CLAUDE_CODE_LOGINS) expect(aClaudeCodeLogin({ [name]: '' }), name).toBe(false)
  })

  it('is a credentials file in ~/.claude, which /login leaves', () => {
    const home = aHome(true)
    expect(theCredentialsFile({ HOME: home })).toBe(join(home, '.claude', '.credentials.json'))
    expect(aClaudeCodeLogin({ HOME: home })).toBe(true)
  })

  it('is not a home with no credentials file, nor no home at all', () => {
    expect(aClaudeCodeLogin({ HOME: aHome(false) })).toBe(false)
    expect(theCredentialsFile({})).toBeNull()
    expect(aClaudeCodeLogin({})).toBe(false)
  })

  it('reads the credentials file from CLAUDE_CONFIG_DIR when that is set, and not from ~/.claude', () => {
    const configured = aHome(false)
    writeFileSync(join(configured, '.credentials.json'), '{}', { mode: 0o600 })
    expect(aClaudeCodeLogin({ HOME: aHome(false), CLAUDE_CONFIG_DIR: configured })).toBe(true)
    // ~/.claude holds one, and the configured folder does not: Claude Code would not find it there.
    expect(aClaudeCodeLogin({ HOME: aHome(true), CLAUDE_CONFIG_DIR: aHome(false) })).toBe(false)
  })
})
