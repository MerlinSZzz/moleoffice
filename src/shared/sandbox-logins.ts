// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SANDBOXES' LOGINS, AS THE SERVER AND THE SETTINGS PAGE BOTH READ THEM. The reasons
 * are in src/server/lib/sandbox-logins.ts.
 *
 * Every field is a name, a runtime word, a boolean or a sentence. No value is ever in one: the office answers only
 * whether a login is set.
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
