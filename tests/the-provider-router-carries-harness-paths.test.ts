// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createServer, request, type Server } from 'node:http'
import { mkdirSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createProviderRouter } from '../tools/provider-router.mjs'
import { openTheBridge } from '../tools/provider-router-bridge.mjs'
import { aRouterFolderFor } from '../tools/provider-router-host.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

const TOKEN = 'made-up-router-token'
const pairs = [
  ['deepseek', '/chat/completions'], ['opencode-go', '/chat/completions'],
  ['openrouter', '/chat/completions'], ['openai', '/chat/completions'],
  ['openai', '/responses'], ['anthropic', '/messages'],
] as const
const keys = Object.fromEntries(pairs.map(([provider]) => [provider, `made-up-key-for-${provider}`]))
const slots = Object.entries(keys).map(([provider, key]) => ({ id: `slot-${provider}`, provider, label: provider, key }))
const requests: { path: string; headers: import('node:http').IncomingHttpHeaders; body: Record<string, unknown> }[] = []
const receipts: { slot: string; usage: unknown }[] = []
let office: Server
let vendor: Server
let router: ReturnType<typeof createProviderRouter>
let folder = ''
let socket = ''
let response = ''

function address(server: Server): string { return `http://127.0.0.1:${(server.address() as AddressInfo).port}` }
function listen(server: Server): Promise<void> { return new Promise((done) => server.listen(0, '127.0.0.1', done)) }
function post(path: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; text: string }> {
  return new Promise((done, reject) => {
    const req = request({ socketPath: socket, path, method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, (res) => {
      const parts: Buffer[] = []
      res.on('data', (part: Buffer) => parts.push(part))
      res.on('end', () => done({ status: res.statusCode ?? 0, text: Buffer.concat(parts).toString() }))
    })
    req.on('error', reject)
    req.end(JSON.stringify(body))
  })
}

beforeAll(async () => {
  office = createServer((req, res) => {
    const parts: Buffer[] = []
    req.on('data', (part: Buffer) => parts.push(part))
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(parts).toString())
      res.setHeader('content-type', 'application/json')
      if (req.url === '/api/provider-router/admissions') {
        res.end(JSON.stringify(body.token === TOKEN ? { admitted: true, id: 'token-id', run: 'run-id' } : { admitted: false, code: 'invalid-token', says: 'Refused.' }))
      } else { receipts.push(body); res.writeHead(201).end('{}') }
    })
  })
  vendor = createServer((req, res) => {
    const parts: Buffer[] = []
    req.on('data', (part: Buffer) => parts.push(part))
    req.on('end', () => {
      requests.push({ path: req.url ?? '', headers: req.headers, body: JSON.parse(Buffer.concat(parts).toString()) })
      res.writeHead(200, { 'content-type': response.startsWith('data:') ? 'text/event-stream' : 'application/json' })
      res.end(response)
    })
  })
  await listen(office); await listen(vendor)
  folder = aTestDatabaseFolder('rp')
  const sandboxes = join(folder, 's')
  mkdirSync(join(sandboxes, '.run', 'a'), { recursive: true, mode: 0o700 })
  aRouterFolderFor(join(sandboxes, '.run', 'a'))
  socket = join(sandboxes, '.run', 'a', 'provider-router', 'router.sock')
  router = createProviderRouter({ sandboxes, slots, office: { api: address(office), key: 'made-up-office-key' }, upstreams: Object.fromEntries(Object.keys(keys).map((provider) => [provider, address(vendor)])), log: () => {} })
  await router.start(); await router.open('a')
})
afterAll(async () => {
  await router?.close()
  await new Promise<void>((done) => vendor?.close(() => done()))
  await new Promise<void>((done) => office?.close(() => done()))
  if (folder) removeThisTestFolder(folder)
})

describe('the router carries each harness wire format', () => {
  it('swaps both incoming credential headers for the provider key and preserves the vendor response', async () => {
    for (const [provider, path] of pairs) for (const stream of [false, true]) {
      response = stream ? 'data: {"example":true}\n\ndata: [DONE]\n\n' : '{"example":true}'
      const result = await post(`/${provider}${path}`, { ...(provider === 'anthropic' && stream ? {} : { authorization: `Bearer ${TOKEN}` }), 'x-api-key': TOKEN, cookie: 'made-up-cookie', 'x-mole-office-key': 'made-up-office-credential', 'x-mole-office-extra': 'made-up-extra', 'anthropic-version': '2023-06-01' }, { model: 'made-up', stream })
      expect(result.status, `${provider}${path}`).toBe(200)
      expect(result.text).toBe(response)
      const seen = requests.at(-1)!
      expect(seen.path).toBe(path)
      expect(JSON.stringify(seen.headers).includes(TOKEN)).toBe(false)
      expect(seen.headers.cookie).toBeUndefined()
      expect(seen.headers['x-mole-office-key']).toBeUndefined()
      expect(seen.headers['x-mole-office-extra']).toBeUndefined()
      expect(provider === 'anthropic' ? seen.headers['x-api-key'] === keys[provider] && seen.headers.authorization === undefined : seen.headers.authorization === `Bearer ${keys[provider]}` && seen.headers['x-api-key'] === undefined).toBe(true)
      expect(seen.headers['anthropic-version']).toBe('2023-06-01')
    }
  })

  it('records input, cached input and output usage from all three formats in both response forms', async () => {
    const cases = [
      ['/deepseek/chat/completions', '{"usage":{"prompt_tokens":10,"completion_tokens":4,"prompt_tokens_details":{"cached_tokens":2}}}'],
      ['/deepseek/chat/completions', 'data: {"usage":{"prompt_tokens":10,"completion_tokens":4,"prompt_tokens_details":{"cached_tokens":2}}}\n\n'],
      ['/openai/responses', '{"usage":{"input_tokens":10,"output_tokens":4,"input_tokens_details":{"cached_tokens":2}}}'],
      ['/openai/responses', 'data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":4,"input_tokens_details":{"cached_tokens":2}}}}\n\n'],
      ['/anthropic/messages', '{"usage":{"input_tokens":10,"output_tokens":4,"cache_read_input_tokens":2,"cache_creation_input_tokens":3}}'],
      ['/anthropic/messages', 'data: {"type":"message_start","message":{"usage":{"input_tokens":10,"cache_read_input_tokens":2,"cache_creation_input_tokens":3}}}\n\ndata: {"type":"message_delta","usage":{"output_tokens":4}}\n\n'],
    ] as const
    for (const [path, answer] of cases) {
      response = answer
      const result = await post(path, { authorization: `Bearer ${TOKEN}` }, { model: 'made-up', stream: answer.startsWith('data:') })
      expect(result.status, path).toBe(200)
      expect.soft(receipts.at(-1)?.usage, path).toEqual({ inputTokens: path.startsWith('/anthropic/') ? 15 : 10, cachedInputTokens: 2, outputTokens: 4 })
    }
  })

  it('points OpenCode at the bridge while keeping its existing plugins and providers', async () => {
    for (const provider of Object.keys(keys)) {
      const keyName = ({ deepseek: 'DEEPSEEK_API_KEY', 'opencode-go': 'OPENCODE_API_KEY', openrouter: 'OPENROUTER_API_KEY', openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' } as Record<string, string>)[provider]!
      const env: Record<string, string | undefined> = { [keyName]: TOKEN, DEEPSEEK_BASE_URL: 'kept-dsh-address', OPENCODE_CONFIG_CONTENT: JSON.stringify({ plugin: ['existing'], provider: { another: { options: { baseURL: 'kept' } } } }) }
      const bridge = await openTheBridge(JSON.stringify({ provider, socket, runtime: 'opencode' }), env, (sentence: string): never => { throw new Error(sentence) })
      try {
        const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT!)
        if (provider === 'deepseek') expect(env.DEEPSEEK_BASE_URL).toBe('kept-dsh-address')
        expect(config.plugin).toEqual(['existing'])
        expect(config.provider.another.options.baseURL).toBe('kept')
        expect(config.provider[provider].options.baseURL).toBe(bridge!.baseUrl)
        expect(config.provider[provider].options.apiKey === TOKEN).toBe(true)
      } finally { await bridge?.close() }
    }
  })

  it('treats a legacy line as the primary program and refuses a mismatched runtime', async () => {
    const env: Record<string, string | undefined> = { DEEPSEEK_API_KEY: TOKEN, DEEPSEEK_BASE_URL: 'before' }
    const refuse = (sentence: string): never => { throw new Error(sentence) }
    const legacy = await openTheBridge(JSON.stringify({ provider: 'deepseek', socket }), env, refuse)
    try { expect(env.DEEPSEEK_BASE_URL).toBe(legacy!.baseUrl) } finally { await legacy?.close() }
    const before = { ...env }
    let invalid: Awaited<ReturnType<typeof openTheBridge>> = null
    let refused = false
    try { invalid = await openTheBridge(JSON.stringify({ provider: 'deepseek', socket, runtime: 'anthropic' }), env, refuse) }
    catch { refused = true }
    finally { await invalid?.close() }
    expect(refused).toBe(true)
    expect(env).toEqual(before)
  })

})
