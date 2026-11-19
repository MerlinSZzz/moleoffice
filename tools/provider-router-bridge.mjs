// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BRIDGE INSIDE A SANDBOX: a HTTP server on the container's loopback that carries a run's provider requests to the
 * provider router's socket for that sandbox, and points the run's program at itself. tools/sandbox-start.mjs opens it
 * when the env file carries SANDBOX_PROVIDER_ROUTER, and closes it when the run's program exits.
 *
 * It listens on 127.0.0.1 only, never on every address, so nothing outside the container reaches it. It changes nothing
 * it carries: the run's token goes on to the router, which swaps it for a key on the host.
 *
 * HOW A PROGRAM IS POINTED AT IT. dsh reads its provider's address from a variable, DEEPSEEK_BASE_URL. OpenCode reads no
 * such variable: it takes a provider's address and key from its config, and its config from OPENCODE_CONFIG_CONTENT when
 * that is set. So for OpenCode Go the bridge adds its own address and the run's token to the opencode-go provider in that
 * config, and keeps every plugin and provider the config already held. The launcher names the runtime in its line.
 */
import { createServer, request } from 'node:http'
import { createConnection } from 'node:net'
import { THE_ROUTED_PROVIDERS, THE_ROUTER_VARIABLE } from '../src/config/provider-router.mjs'

const LOOPBACK = '127.0.0.1'

/** Whether something accepts a connection on the socket. */
function theSocketAnswers(socket) {
  return new Promise((done) => {
    const tried = createConnection(socket)
    tried.once('connect', () => { tried.end(); done(true) })
    tried.once('error', () => done(false))
  })
}

/** Carries one request to the router's socket and its answer back, unchanged. */
function carry(req, res, socket) {
  const onward = request({ socketPath: socket, method: req.method, path: req.url, headers: req.headers }, (answer) => {
    res.writeHead(answer.statusCode ?? 502, answer.headers)
    answer.pipe(res)
  })
  onward.on('error', () => {
    if (res.headersSent) { res.destroy(); return }
    res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({
      error: { message: 'The provider router stopped answering on its socket.', type: 'mole_office_provider_router', code: 'router-unreachable' },
    }))
  })
  req.pipe(onward)
}

/**
 * HOW TO POINT OPENCODE AT THE BRIDGE: a function from the bridge's base URL to the text OPENCODE_CONFIG_CONTENT then
 * holds, with the provider's entry given the bridge's address and the run's token. A missing token, or a config that is
 * not a JSON object, is refused here, before anything opens.
 * @param {Record<string, string | undefined>} env
 * @param {string} provider
 * @param {(sentence: string) => never} refuse
 * @returns {(baseUrl: string) => string}
 */
function howToPointOpenCode(env, provider, refuse) {
  const { keyName, nativeProvider: primary, harnesses } = THE_ROUTED_PROVIDERS[provider]
  const nativeProvider = harnesses.find((one) => one.runtime === 'opencode')?.nativeProvider ?? primary
  const token = env[keyName]
  if (typeof token !== 'string' || token === '') return refuse(`${keyName} holds no run token, so this run cannot reach ${provider} through the provider router. Nothing was started.`)
  let config = {}
  if (env.OPENCODE_CONFIG_CONTENT !== undefined) {
    try { config = JSON.parse(env.OPENCODE_CONFIG_CONTENT) } catch { config = null }
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
      return refuse('OPENCODE_CONFIG_CONTENT is not a JSON object, so the bridge cannot point OpenCode at the provider router. Nothing was started.')
    }
  }
  const providers = config.provider !== null && typeof config.provider === 'object' ? config.provider : {}
  const own = providers[nativeProvider] !== null && typeof providers[nativeProvider] === 'object' ? providers[nativeProvider] : {}
  const options = own.options !== null && typeof own.options === 'object' ? own.options : {}
  return (baseUrl) => JSON.stringify({ ...config, provider: { ...providers, [nativeProvider]: { ...own, options: { ...options, baseURL: baseUrl, apiKey: token } } } })
}

/**
 * OPEN THE BRIDGE for the line the launcher wrote, or do nothing when it wrote none. Points the run's program at the
 * bridge, through its base URL variable or, for OpenCode, its config, and answers the bridge's address, its port, that
 * base URL and how to close it.
 * @param {string | undefined} raw the value of SANDBOX_PROVIDER_ROUTER
 * @param {Record<string, string | undefined>} env the environment the run's program is started with
 * @param {(sentence: string) => never} refuse
 * @returns {Promise<{ address: string, port: number, baseUrl: string, close: () => Promise<void> } | null>}
 */
export async function openTheBridge(raw, env, refuse) {
  if (raw === undefined) return null
  let line = null
  try { line = JSON.parse(raw) } catch { line = null }
  const provider = line !== null && typeof line === 'object' && typeof line.provider === 'string' && Object.hasOwn(THE_ROUTED_PROVIDERS, line.provider) ? line.provider : null
  if (provider === null || typeof line.socket !== 'string' || !line.socket.startsWith('/')) {
    return refuse(`${THE_ROUTER_VARIABLE} is not a line this helper can read: it must be JSON naming a routed provider and the router's socket. Nothing was started.`)
  }
  const socket = line.socket
  const { baseUrlName, program, harnesses } = THE_ROUTED_PROVIDERS[provider]
  const runtime = line.runtime === undefined ? program : line.runtime
  if (runtime !== program && !harnesses.some((one) => one.runtime === runtime)) {
    return refuse(`The provider router line names a runtime that cannot use ${provider}. Nothing was started.`)
  }
  const pointOpenCode = runtime === 'opencode' ? howToPointOpenCode(env, provider, refuse) : null
  if (!(await theSocketAnswers(socket))) {
    return refuse(`The provider router does not answer on ${socket}, so this run cannot reach ${provider}. Start the provider router on the host, then start the run again. Nothing was started.`)
  }
  const server = createServer((req, res) => carry(req, res, socket))
  await new Promise((done, failed) => { server.once('error', failed); server.listen(0, LOOPBACK, () => done(undefined)) })
  const address = /** @type {import('node:net').AddressInfo} */ (server.address())
  const baseUrl = `http://${LOOPBACK}:${String(address.port)}/${provider}`
  if (pointOpenCode !== null) env.OPENCODE_CONFIG_CONTENT = pointOpenCode(baseUrl)
  else if (baseUrlName !== null) env[baseUrlName] = baseUrl
  let closed = null
  return {
    address: address.address,
    port: address.port,
    baseUrl,
    close: () => {
      closed ??= new Promise((done) => { server.closeAllConnections(); server.close(() => done(undefined)) })
      return closed
    },
  }
}
