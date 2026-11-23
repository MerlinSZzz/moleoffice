// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SANDBOXES' LOGINS, AS THE SERVER AND THE SETTINGS PAGE BOTH READ THEM. The reasons
 * are in src/server/lib/sandbox-logins.ts.
 *
 * Every field is a name, a runtime word, a boolean or a sentence, or what a test of a login read: an outcome word, a
 * status, a time and a balance. No value is ever in one: the office answers whether a login is set and what its
 * provider answered a test, and never the login.
 */

/** One login a sandbox may be handed, as the templates declare it. */
export interface SandboxLoginOnScreen {
  /** The environment name, e.g. `OPENCODE_API_KEY`. */
  name: string
  /** The programs that read it, as the templates' `readBy` names them, e.g. `opencode`. */
  readBy: string[]
  /** Whether the sandboxes' secrets file holds a value for it. The only thing a reply may say. */
  set: boolean
}

/** Everything the section draws. */
export interface SandboxLogins {
  /** The secrets file the templates name, as they write it (`~` for the home folder), or null when they disagree. */
  file: string | null
  /** A sentence when the file can be read by others, which the launcher refuses; null when it cannot. */
  unsafe: string | null
  /** Every declared name, in the order the templates declare them. */
  names: SandboxLoginOnScreen[]
  /** One plain sentence saying how many are set. */
  says: string
}

/**
 * WHAT THE LOGIN'S PROVIDER ANSWERED ITS ONE TEST REQUEST, read as one of five outcomes. The reasons are in
 * src/server/lib/sandbox-login-tests.ts.
 *
 *   works            the provider accepted the login
 *   refused          the provider answered 401
 *   limit            the login is at a limit, or out of credit
 *   no-clear-answer  any other answer, or none within 20 s
 *   no-test-known    no test has been decided for this name, so nothing was sent
 */
export type SandboxLoginOutcome = 'works' | 'refused' | 'limit' | 'no-clear-answer' | 'no-test-known'

/** One balance the provider showed, as its own number and currency, e.g. `110.00` and `CNY`. */
export interface SandboxLoginBalance {
  total: string
  currency: string
}

/** One press of the Test press. No field ever carries the login, and none carries the provider's words. */
export interface SandboxLoginTested {
  name: string
  outcome: SandboxLoginOutcome
  /** The HTTP status the provider answered, or null when nothing answered. */
  status: number | null
  /** When a limit resets, LOCAL wall clock, only from a retry-after of whole seconds. Null when none was given. */
  resetsAt: string | null
  /** The balances the provider showed with its answer. Empty when it showed none. */
  balances: SandboxLoginBalance[]
  /**
   * For works: whether the answer said anything about credit. False is "credit not checked", and says nothing about
   * whether there is any. Null for every other outcome.
   */
  creditChecked: boolean | null
  /** When the answer was read, LOCAL wall clock. Null when nothing was sent. */
  readAt: string | null
  /** True when this is the result of a press in the last 30 s, answered again without sending anything. */
  fromAnEarlierPress: boolean
}
