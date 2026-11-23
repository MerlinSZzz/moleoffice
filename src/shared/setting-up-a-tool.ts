// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEY PAGE'S WAYS: each agent tool and way of signing in that has a page of its own, at #/set-up/<tool>/<way>.
 * Wave 13u, round 242.
 *
 * The person asked that setting up a tool take only his ask, then typing and confirming. A secretary leads him to one of
 * these pages with a page lead, and the page is his: it holds one input and Confirm for a key, or one Sign in press for an
 * account. The address parser (src/shared/addresses.ts) accepts these five and no other, so a lead to any other way is
 * refused by the server's lead check and an address with a typo lands on the not-found page.
 *
 * `tool` is the tool's id in src/server/lib/harnesses.ts. `provider` is what the key door, POST /api/harnesses/:id/key,
 * takes for that way: OpenCode's two providers by OpenCode's own ids, and null for Codex, which takes none. The key door
 * holds its own list of OpenCode's providers (src/server/lib/setting-up-an-agent-tool.ts), so a provider here that it
 * does not take is refused there, loudly, and never passed on.
 */

/** The first segment of a key page's address. */
export const SET_UP_SEGMENT = 'set-up'

/** One way of setting up one agent tool: a key the person pastes, or the tool's own account sign-in. */
export interface ASetUpWay {
  tool: string
  way: string
  takes: 'a key' | 'an account'
  provider: string | null
}

export const SET_UP_WAYS = [
  { tool: 'codex', way: 'api-key', takes: 'a key', provider: null },
  { tool: 'codex', way: 'chatgpt', takes: 'an account', provider: null },
  { tool: 'opencode', way: 'opencode', takes: 'a key', provider: 'opencode' },
  { tool: 'opencode', way: 'opencode-go', takes: 'a key', provider: 'opencode-go' },
  { tool: 'claude-code', way: 'claude', takes: 'an account', provider: null },
] as const satisfies readonly ASetUpWay[]

export type SetUpWay = (typeof SET_UP_WAYS)[number]

/** The way an address names, or null when it names none of the five. */
export function theSetUpWay(tool: string, way: string): SetUpWay | null {
  return SET_UP_WAYS.find((one) => one.tool === tool && one.way === way) ?? null
}

/** The key page's address for one way, without the leading #. The one place it is built. */
export function setUpPath(one: Pick<ASetUpWay, 'tool' | 'way'>): string {
  return `/${SET_UP_SEGMENT}/${one.tool}/${one.way}`
}
