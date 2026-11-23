// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT AN AGENT TOOL'S OWN STATUS COMMAND SAYS ABOUT ITS SIGN-IN, read from what it printed. Wave 13u, round 242.
 *
 * ONE READING OF EACH TOOL'S WORDS. The harness reading on Terminal management (./setting-up-an-agent-tool.ts) and the
 * key reading in Settings (`whatAnAgentToolSaysAboutItsKey` in ./resources.ts) both read Codex's `login status` here, so
 * the two cannot read the same words differently. This file imports nothing, so resources.ts can read it without
 * loading the terminal holder.
 *
 * Each answer is 'yes', 'no', or null when the words say neither. Null is never turned into a guess.
 */

/** `codex login status`, on either stream: "Logged in using ChatGPT", or "Not logged in". Read on codex-cli 0.159.2. */
export function whatCodexSaysOfItsSignIn(printed: string): 'yes' | 'no' | null {
  if (/not logged in|logged out|no credentials|not authenticated/i.test(printed)) return 'no'
  if (/logged in|authenticated/i.test(printed)) return 'yes'
  return null
}

/**
 * `claude auth status --json`: an object whose `loggedIn` is true or false. Its help on Claude Code 2.1.281 says JSON is
 * the default and that the command exits 1 when not logged in, so the words are read whatever the exit code.
 */
export function whatClaudeCodeSaysOfItsSignIn(printed: string): 'yes' | 'no' | null {
  let said: unknown
  try {
    said = JSON.parse(printed.trim())
  } catch {
    // Handled: words that are not JSON say neither, and the caller answers that they were not understood.
    return null
  }
  const loggedIn = typeof said === 'object' && said !== null ? (said as { loggedIn?: unknown }).loggedIn : undefined
  return loggedIn === true ? 'yes' : loggedIn === false ? 'no' : null
}

/**
 * `opencode auth list`: a line such as "2 credentials" among colour codes and box characters, on OpenCode 1.18.31.
 * Signed in is at least one credential held, for any provider: which provider a credential is for is not read here.
 */
export function whatOpenCodeSaysOfItsSignIn(printed: string): 'yes' | 'no' | null {
  // eslint-disable-next-line no-control-regex
  const plain = printed.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
  const counted = /(\d+)\s+credentials?\b/i.exec(plain)
  if (counted === null) return null
  return Number(counted[1]) > 0 ? 'yes' : 'no'
}
