// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * HOW A TOOL ASKS THE PROVIDER ROUTER AT THE OFFICE'S OWN ADDRESS. A sandbox command is given
 * MOLE_OFFICE_API over host networking, and no office socket and no bridge. This module mints one tool token for the
 * run's own key, then sends each of the tool's requests to POST /api/provider-router/tool-requests, which carries it
 * to the router's host-only control socket. The token is checked by the office on every call and again by the router.
 *
 * THE TOKEN IS NOT THE OFFICE KEY. The run's own key is read from the run's office tool configuration (or MOLE_AGENT_KEY
 * when that is the key a shell holds), and it is sent only to the office. The minted token is sent in the Authorization
 * header of each carried request. A caller with the office's key and no token is refused.
 *
 * A 404 IS READ, NOT GUESSED AT. An office without the token door answers 404 with its own `No such endpoint:` body
 * naming that door; only that answer is an older office, and this module then answers `route: null` with
 * `olderOffice: true` so the tool goes on using the office's key file exactly as it did before. A 404 whose body says
 * the run is not in this project is that refusal, and every other 404 — including one with no readable body — is a
 * refusal too: the tool does not fall back to a guess. Every other non-201 answer is refused as before.
 *
 * AN UNPRICED MODEL MAY FALL BACK WHEN THE CALLER ASKS. The token door answers 409 when the price table cannot price
 * the model. Only when the caller passes `fallBackWhenUnpriced: true` and that answer is the refusal for this model
 * does this module answer `route: null` with `unpricedModel: true`, so the tool may use its key file as before. Without
 * that option, and for every other 409, the answer is a refusal.
 *
 * NOTHING HERE READS A PROVIDER KEY. The key stays in the router's key slots file on the host.
 */
import { theAgentKey } from '../for-agents/agent-key.mjs'
import { OFFICE_TOOL_CONFIGURATION, theRunsKeyFromItsOfficeToolFile } from '../src/config/run-permissions.mjs'
import { THE_TOOL_REQUEST_PATHS } from '../src/config/provider-router.mjs'
import { officeHeaders } from './sandbox-common.mjs'

/** The door this module mints at, and the one an older office's `No such endpoint:` body has to name. */
const THE_TOOL_TOKEN_DOOR = '/api/provider-router/tool-tokens'

/**
 * The carried path a full OpenRouter address names, or null when the router does not carry it. The path is read from
 * the router's own table and never taken from the address as a path to send upstream.
 * @param {string} provider
 * @param {string} url
 * @returns {string | null}
 */
export function theCarriedPathOf(provider, url) {
  const paths = Object.hasOwn(THE_TOOL_REQUEST_PATHS, provider)
    ? THE_TOOL_REQUEST_PATHS[/** @type {keyof typeof THE_TOOL_REQUEST_PATHS} */ (provider)]
    : undefined
  if (paths === undefined) return null
  let pathname
  try { pathname = new URL(url).pathname } catch { return null }
  return Object.keys(paths)
    .sort((a, b) => b.length - a.length)
    .find((one) => pathname === one || pathname.endsWith(one)) ?? null
}

/**
 * THE ROUTE TO OPENROUTER FOR THIS RUN, or the reason there is none. `route: null` with `olderOffice: true` is an office
 * whose 404 said `No such endpoint:` and named the tool-token door: the tool uses its key file as before. `route: null`
 * with `unpricedModel: true` is the same fallback for an unpriced model, and only when the caller asked for it with
 * `fallBackWhenUnpriced: true`. `route: null` with `refused: true` is a refusal, including a 404 that says the run is
 * not in this project, a 404 that does not say the door is missing, and every other refusal: the tool must refuse too,
 * and must not spend another way.
 *
 * @param {{ provider?: string, model: string, endpoints: readonly string[], env?: Record<string, string | undefined>,
 *   fetchImpl?: typeof fetch, fallBackWhenUnpriced?: boolean }} given
 * @returns {Promise<{ route: { office: string, token: string, provider: string, fetch: (url: string, init?: RequestInit, waitMs?: number) => Promise<{ status: number, ok: boolean, text: () => Promise<string>, json: () => Promise<unknown> }> } | null, why: string, olderOffice?: true, unpricedModel?: true, refused?: true }>}
 */
export async function aToolRouteToTheProvider({ provider = 'openrouter', model, endpoints, env = process.env, fetchImpl = fetch, fallBackWhenUnpriced = false }) {
  const office = typeof env['MOLE_OFFICE_API'] === 'string' ? env['MOLE_OFFICE_API'].replace(/\/+$/u, '') : ''
  const workspace = env['MOLE_OFFICE_WORKSPACE']
  const agent = env['MOLE_OFFICE_AGENT']
  const session = env['MOLE_OFFICE_SESSION']
  if (office === '' || workspace === undefined || agent === undefined || session === undefined) {
    return { route: null, why: 'this tool was not started by a run that names an office, a project, an agent and a run' }
  }
  const carries = Object.hasOwn(THE_TOOL_REQUEST_PATHS, provider)
    ? THE_TOOL_REQUEST_PATHS[/** @type {keyof typeof THE_TOOL_REQUEST_PATHS} */ (provider)]
    : undefined
  const notCarried = endpoints.filter((one) => carries === undefined || !Object.hasOwn(carries, one))
  if (notCarried.length > 0) {
    return { route: null, why: `the provider router does not carry ${notCarried.join(', ')} for ${provider}` }
  }
  // THE RUN'S OWN KEY, never the office key and never a provider key. A shell that holds MOLE_AGENT_KEY as well still
  // uses its run's configuration first, because the token door proves the run only with its own key.
  const configuration = env[OFFICE_TOOL_CONFIGURATION]
  let key
  if (typeof configuration === 'string' && configuration !== '') {
    const read = theRunsKeyFromItsOfficeToolFile(env, { agent, session })
    if (read.key === null) return { route: null, why: `this shell cannot read its run's own key: ${read.why}` }
    key = read.key
  } else {
    const agentKey = theAgentKey(env)
    if (agentKey === null) return { route: null, why: 'this shell holds no run key and names no office tool configuration' }
    key = agentKey
  }
  const headers = officeHeaders({ workspace, agent, session, key })
  let minted
  try {
    minted = await fetchImpl(`${office}${THE_TOOL_TOKEN_DOOR}`, {
      method: 'POST', headers, body: JSON.stringify({ run: session, provider, model }),
    })
  } catch (error) {
    return { route: null, why: `the office could not be reached to mint a tool token (${error instanceof Error ? error.message : String(error)})` }
  }
  let answered = null
  try { answered = await minted.json() } catch { answered = null }
  const answeredError = (/** @type {{ error?: unknown } | null} */ (answered))?.error
  const error = typeof answeredError === 'string' ? answeredError : ''
  if (minted.status === 404) {
    if (error.includes('There is no run ') && error.includes(' in this project')) {
      return { route: null, why: error, refused: true }
    }
    if (error.startsWith('No such endpoint:') && error.includes(THE_TOOL_TOKEN_DOOR)) {
      return { route: null, why: 'the office has no tool-token door, so this run uses the office key file as before', olderOffice: true }
    }
    return {
      route: null,
      why: 'the office answered 404 when asked for a tool token, and the answer did not say the tool-token door is missing, so the tool does not fall back to the office key file',
      refused: true,
    }
  }
  if (minted.status !== 201) {
    const why = String(answeredError ?? `the office answered ${String(minted.status)} when asked for a tool token`)
    const theModelIsUnpriced =
      error.startsWith("No price table is set, so the office cannot count this run's spend against its cap.") ||
      error.startsWith(`The price table names no price for ${model}, so the office cannot count this run's spend against its cap.`)
    if (minted.status === 409 && fallBackWhenUnpriced && theModelIsUnpriced) {
      return { route: null, why, unpricedModel: true }
    }
    return { route: null, why, refused: true }
  }
  const token = /** @type {{ token?: unknown } | null} */ (answered)?.token
  if (typeof token !== 'string' || !/^mrt_[A-Za-z0-9_-]{43}$/u.test(token)) {
    return { route: null, why: "the office's answer to the tool token did not hold a token", refused: true }
  }
  const asking = { ...officeHeaders({ workspace, agent, session, key }), authorization: `Bearer ${token}` }
  return {
    route: {
      office,
      token,
      provider,
      /** One carried request, answered as the provider answered it. The path comes from the router's table. */
      fetch: async (url, init, waitMs) => {
        const path = theCarriedPathOf(provider, url)
        if (path === null) throw new Error(`The provider router does not carry ${new URL(url).pathname}.`)
        const method = String(init?.method ?? 'GET').toUpperCase()
        const allowed = /** @type {Record<string, string> | undefined} */ (carries)?.[path]
        if (method !== allowed) throw new Error(`The provider router carries ${path} with ${String(allowed)}, not ${method}.`)
        let body = init?.body
        if (typeof body === 'string') {
          try { body = JSON.parse(body) } catch { body = undefined }
        }
        const answer = await fetchImpl(`${office}/api/provider-router/tool-requests`, {
          method: 'POST',
          headers: asking,
          body: JSON.stringify({ provider, path, ...(body === undefined ? {} : { body }) }),
          signal: AbortSignal.timeout(waitMs ?? 300_000),
        })
        const text = await answer.text()
        return { status: answer.status, ok: answer.ok, text: async () => text, json: async () => JSON.parse(text) }
      },
    },
    why: '',
  }
}
