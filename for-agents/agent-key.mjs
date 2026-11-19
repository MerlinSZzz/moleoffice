// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE AGENT'S OWN KEY, AND THE HEADERS AN AGENT'S TOOL SENDS IT UNDER.
 *
 * Moved here from tools/sandbox-common.mjs, because the waiter
 * (for-agents/hold-the-handle.mjs) needs both and an installed office ships for-agents/ but never
 * tools/. tools/sandbox-common.mjs exports both from here, so every tool that imports them from there
 * is unchanged.
 *
 * The reader of the key is now in src/config/agent-key-reader.mjs, and this file exports its names again.
 */
import { theAgentKey } from '../src/config/agent-key-reader.mjs'

// THE HEADER A KEY TRAVELS ON, declared once beside the key it carries.
import { KEY_HEADER } from '../src/config/key-header.mjs'

export { A_VISITORS_TOKEN, THE_AGENT_KEY, aSecretFromTheEnvironment, theAgentKey } from '../src/config/agent-key-reader.mjs'

/** @typedef {import('../src/config/agent-key-reader.mjs').ASecret} ASecret */

/**
 * WHICH AGENT AN AGENT'S TOOL ASKS AS, AND THE KEY THAT PROVES IT. Every tool an agent runs builds
 * its actor headers here, so the key and the name it proves are worked out in one place.
 *
 * Every agent's tool sends the agent's own key. The
 * office refuses a request whose key proves one agent while its header names another. So:
 *
 *   - With a key, the key goes on x-mole-office-key and the actor id is `self`, the caller's own
 *     handle. `self` is the tool's --as or --actor flag when the caller named itself there, and
 *     MOLE_OFFICE_AGENT when it did not. With a key and no `self`, this throws, because the key could
 *     only be sent under a name that is not its holder's.
 *   - With no key, the actor id is `withoutAKey`, which is what the tool sent before keys. Nothing
 *     changes for a caller that holds no key.
 *
 * `key` is theAgentKey() unless the caller says otherwise. Only tools/session-hook.mjs does, because
 * it can run before it knows which agent its session is.
 *
 * @param {{ self?: string | null, withoutAKey?: string | null, key?: string | null }} who
 * @returns {Record<string, string>}
 */
export function anAgentsToolHeaders({ self, withoutAKey, key = theAgentKey() }) {
  const own = typeof self === 'string' && self !== '' ? self : (process.env['MOLE_OFFICE_AGENT'] ?? '')
  if (key === null) {
    const name = withoutAKey ?? own
    return { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': name }
  }
  if (own === '') {
    throw new Error(
      'This agent holds a key (from MOLE_AGENT_KEY_FILE or MOLE_AGENT_KEY), but nothing says which agent holds it: there is no --as and no MOLE_OFFICE_AGENT. ' +
        'The office refuses a key sent under another name. Set MOLE_OFFICE_AGENT to your own handle. Nothing was sent.',
    )
  }
  return { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': own, [KEY_HEADER]: key }
}
