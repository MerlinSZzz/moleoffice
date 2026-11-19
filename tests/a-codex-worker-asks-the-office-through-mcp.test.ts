// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * IcgsA-OGvbzL: Codex's stdio server uses the same four request rules as dsh.
 * All offices here are local stand-ins, every key is synthetic. The real server process speaks
 * JSON-RPC on stdin/stdout. Only the reply-reading failure is injected through its exported handler.
 * Each case names the mutation it detects; mutations are tried separately after the control.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createInterface } from 'node:readline'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { answerOfficeMessage } from '../tools/office-mcp.mjs'
import { A_KEY_SHOWN_AS, THE_LONGEST_REPLY, OFFICE_REQUEST, officeRequestDefinition, theRunsIdentity } from '../tools/office-request.mjs'
import { officeHeaders } from '../tools/sandbox-common.mjs'

const key = 'a1'.repeat(32)
const replyKey = 'b2'.repeat(32)
const identity = { MOLE_OFFICE_AGENT: 'synthetic-codex', MOLE_OFFICE_SESSION: 'synthetic-session', MOLE_OFFICE_WORKSPACE: 'default' }
let api = ''
let elsewhereAt = ''
let office: Server
let elsewhere: Server
const heard: { url: string; headers: IncomingHttpHeaders; body: string }[] = []
const isCheckpoint = (url: string): boolean => new URL(url, api).searchParams.get('checkpoint') === '1'
const requestedCalls = () => heard.filter((one) => !isCheckpoint(one.url))
let redirects = 0
const clients: ReturnType<typeof client>[] = []

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)))
}

interface Rpc { jsonrpc: string; id: number | null; result?: any; error?: { code: number; message: string } }
function client(extra: NodeJS.ProcessEnv = {}) {
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, ['tools/office-mcp.mjs'], {
    env: { ...process.env, ...identity, MOLE_AGENT_KEY: key, MOLE_OFFICE_API: api, ...extra },
  })
  let id = 0
  let stderr = ''
  const waiting = new Map<number, { resolve: (r: Rpc) => void; reject: (e: Error) => void }>()
  const lines = createInterface({ input: child.stdout })
  lines.on('line', (line) => {
    const response = JSON.parse(line) as Rpc
    waiting.get(response.id!)?.resolve(response)
    waiting.delete(response.id!)
  })
  child.stderr.on('data', (c) => { stderr += String(c) })
  child.on('close', () => {
    for (const pending of waiting.values()) pending.reject(new Error(`Server exited: ${stderr}`))
    waiting.clear()
  })
  return {
    request(method: string, params?: unknown): Promise<Rpc> {
      const current = ++id
      return new Promise((resolve, reject) => {
        waiting.set(current, { resolve, reject })
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: current, method, params }) + '\n')
      })
    },
    notify(method: string) { child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n') },
    async close() {
      const closed = new Promise<void>((resolve) => child.on('close', () => resolve()))
      child.stdin.end()
      await closed
      lines.close()
      expect(stderr).toBe('')
    },
  }
}
let mcp: ReturnType<typeof client>
const call = (args: unknown) => mcp.request('tools/call', { name: 'office_request', arguments: args })

beforeAll(async () => {
  elsewhere = createServer((_req, res) => { redirects++; res.end('redirect followed') })
  elsewhereAt = await listen(elsewhere)
  office = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += String(c) })
    req.on('end', () => {
      heard.push({ url: req.url ?? '', headers: req.headers, body })
      const asked = new URL(req.url ?? '/', 'http://synthetic.invalid')
      if (req.method === 'GET' && asked.pathname === '/api/messages' && asked.searchParams.get('checkpoint') === '1') {
        // THE BOUND CHECKPOINT the office tool reads before every answer. This office holds no mail for the run, so
        // the page is empty; it names the run and agent it is bound to, as the real office's checkpoint reply does.
        res.end(JSON.stringify({ messages: [], left: 0, checkpoint: {
          run: String(req.headers['x-mole-office-session'] ?? ''),
          agent: String(req.headers['x-mole-office-actor-id'] ?? ''),
          oversize: [],
        } }))
      } else if (req.url === '/api/redirect') {
        res.writeHead(302, { location: `${elsewhereAt}/api/next?key=${replyKey}` })
        res.end('redirect body')
      } else if (req.url === '/api/keys') {
        res.writeHead(201, { location: '/api/keys?key=' + replyKey })
        res.end(JSON.stringify({ key: replyKey, short: 'c'.repeat(63), long: 'd'.repeat(66) }))
      } else if (req.url === '/api/refused') {
        res.writeHead(400)
        res.end('{"error":"A synthetic refusal."}')
      } else if (req.url === '/api/long') {
        res.end('x'.repeat(THE_LONGEST_REPLY - 63) + replyKey + 'y'.repeat(1000))
      } else res.end('{"ok":true}')
    })
  })
  api = await listen(office)
  mcp = client()
  clients.push(mcp)
})
afterAll(async () => {
  for (const c of clients) await c.close()
  await Promise.all([office, elsewhere].map((s) => new Promise<void>((resolve) => s.close(() => resolve()))))
})

describe('office_request through Codex’s MCP server', () => {
  // Mutations, each alone: tools/list returns no tools; description restores "you never see and never need";
  // description no longer says "you never need to send yourself"; body loses its type again (problem fO_gBrFz9Ax9).
  it('1: initializes, lists the shared office tool and parameters, and pings after the initialized notification', async () => {
    const init = await mcp.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
    expect(init.result).toMatchObject({ protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mole-office' } })
    mcp.notify('notifications/initialized')
    const listed = await mcp.request('tools/list')
    const officeEntries = listed.result.tools.filter((tool: { name: string }) => tool.name === OFFICE_REQUEST)
    expect(officeEntries).toHaveLength(1)
    const officeTool = officeEntries[0]
    expect(officeTool.description).not.toContain('you never see')
    expect(officeTool.description).toContain('you never need to send yourself')
    expect(officeTool).toMatchObject({
      name: OFFICE_REQUEST, description: officeRequestDefinition.description,
      inputSchema: {
        type: 'object', additionalProperties: false, required: ['method', 'path'],
        properties: {
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: officeRequestDefinition.parameters.method.description },
          path: { type: 'string', description: officeRequestDefinition.parameters.path.description },
          body: { type: 'object', additionalProperties: true, description: officeRequestDefinition.parameters.body.description },
        },
      },
    })
    expect((await mcp.request('ping')).result).toEqual({})
  })

  // Mutation: model headers merged over officeHeaders.
  it('2: sends the environment’s identity and officeHeaders key; the model cannot set headers or the office', async () => {
    heard.length = 0
    const answer = await call({
      method: 'POST', path: '/api/records',
      body: { 'x-mole-office-actor-id': 'somebody-else' },
      headers: { 'x-mole-office-actor-id': 'somebody-else', 'x-mole-office-key': replyKey },
      api: elsewhereAt, agent: 'somebody-else', session: 'other', workspace: 'other',
    })
    expect(answer.result.isError).toBe(false)
    expect(answer.result.content[0]).toEqual({ type: 'text', text: '200\n{"ok":true}' })
    expect(requestedCalls()).toHaveLength(1)
    expect(heard.filter((one) => isCheckpoint(one.url))).toHaveLength(1)
    const expected = officeHeaders({ workspace: identity.MOLE_OFFICE_WORKSPACE, agent: identity.MOLE_OFFICE_AGENT, session: identity.MOLE_OFFICE_SESSION, key })
    for (const one of heard) expect(one.headers).toMatchObject(expected)
    expect(JSON.parse(requestedCalls()[0]!.body)).toEqual({ 'x-mole-office-actor-id': 'somebody-else' })
    expect(redirects).toBe(0)
  })

  // Mutation: redirect: 'manual' becomes 'follow'.
  it('3: returns a 3xx with its Location and body, without following it', async () => {
    const answer = await call({ method: 'GET', path: '/api/redirect' })
    expect(answer.result.content[0].text).toBe(`302 Location: ${elsewhereAt}/api/next?key=${A_KEY_SHOWN_AS}\nredirect body`)
    expect(redirects).toBe(0)
  })

  // Mutation: encoded path check removed (also doubled slash and dot/read-back checks separately).
  it('4: refuses unsafe paths and methods as tool errors and sends nothing; keeps an allowed query', async () => {
    heard.length = 0
    for (const path of ['/api/../x', '/api/%2e%2e/x', '/api/x%2fy', '/api/x%5cy', '/api//x', '/api/x\\y', '/api/x y', '//127.0.0.1/api/x', elsewhereAt + '/api/x', '/x', 'api/x', '']) {
      const refused = await call({ method: 'GET', path })
      expect(refused.result.isError, path).toBe(true)
      expect(refused.result.content[0].text).toContain('The path was refused')
    }
    const method = await call({ method: 'CONNECT', path: '/api/health' })
    expect(method.result.isError).toBe(true)
    expect(method.result.content[0].text).toContain('The method was refused')
    expect(heard).toHaveLength(0)
    await call({ method: 'GET', path: '/api/records?kind=problem&limit=2' })
    expect(requestedCalls().map((h) => h.url)).toEqual(['/api/records?kind=problem&limit=2'])
    expect(heard.filter((one) => isCheckpoint(one.url))).toHaveLength(1)
  })

  // Mutation: shared answer body key replacement removed.
  it('5: replaces body and Location keys while preserving other text', async () => {
    const answer = await call({ method: 'GET', path: '/api/keys' })
    expect(answer.result.content[0].text).toBe(`201 Location: /api/keys?key=${A_KEY_SHOWN_AS}\n${JSON.stringify({ key: A_KEY_SHOWN_AS, short: 'c'.repeat(63), long: 'd'.repeat(66) })}`)
  })

  // Mutation: shared answer cut before replacement.
  it('6: replaces a whole key that straddles the cut', async () => {
    const answer = await call({ method: 'GET', path: '/api/long', fields: 'whole' })
    expect(answer.result.content[0].text).toBe('200\n' + 'x'.repeat(THE_LONGEST_REPLY - 63) + A_KEY_SHOWN_AS + 'y'.repeat(63 - A_KEY_SHOWN_AS.length) + `\n(The rest of the reply, past ${THE_LONGEST_REPLY} characters, is not shown.)`)
  })

  // Mutation: key-replacement call removed from the server’s error answer.
  it('7: returns a scrubbed tool error when nothing answers or reading the answer fails', async () => {
    const request = { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'office_request', arguments: { method: 'GET', path: '/api/health' } } }
    for (const fetchImpl of [
      async () => { throw new Error('connect refused ' + replyKey) },
      async () => ({ text: async () => { throw new Error('reading failed ' + replyKey) } }),
    ]) {
      const answer = await answerOfficeMessage(request, { env: { ...identity, MOLE_OFFICE_API: api }, fetchImpl: fetchImpl as unknown as typeof fetch }) as Rpc
      expect(answer.result.isError).toBe(true)
      expect(answer.result.content[0].text).toContain(A_KEY_SHOWN_AS)
      expect(answer.result.content[0].text).not.toContain(replyKey)
    }
  })

  // Mutation: identity check removed.
  it('8: refuses missing environment identity even when the model supplies it', async () => {
    heard.length = 0
    for (const name of Object.keys(identity)) {
      const missing = client({ [name]: '' })
      clients.push(missing)
      const answer = await missing.request('tools/call', { name: 'office_request', arguments: { method: 'GET', path: '/api/health', ...identity } })
      expect(answer.result.isError).toBe(true)
      expect(answer.result.content[0].text).toContain('This run does not say who it is')
    }
    expect(heard).toHaveLength(0)
  })

  // Mutation: unknown method treated as ping.
  it('9: gives an unknown method a JSON-RPC error', async () => {
    expect(await mcp.request('unknown')).toMatchObject({ jsonrpc: '2.0', error: { code: -32601, message: 'Unknown method.' } })
    expect(await mcp.request('tools/call', { name: 'unknown', arguments: {} })).toMatchObject({ error: { code: -32602 } })
  })

  // Mutation: trailing-slash trimming taken out of whereIsTheApi's override branch.
  it('10: trims the supplied office address and sends /api/ without a doubled slash', async () => {
    heard.length = 0
    const env = { ...identity, MOLE_OFFICE_API: api + '/' }
    // URL resolution already removes a base's trailing slash. Check the address too, so removing
    // the resolver's trimming cannot hide behind that separate behaviour.
    expect(theRunsIdentity(env).api).toBe(api)
    const withSlash = client(env)
    clients.push(withSlash)
    const answer = await withSlash.request('tools/call', { name: 'office_request', arguments: { method: 'GET', path: '/api/health' } })
    expect(answer.result.isError).toBe(false)
    expect(answer.result.content[0]).toEqual({ type: 'text', text: '200\n{"ok":true}' })
    expect(requestedCalls().map((h) => h.url)).toEqual(['/api/health'])
    expect(heard.filter((one) => isCheckpoint(one.url))).toHaveLength(1)
  })

  // PROBLEM fO_gBrFz9Ax9 (17 Oct 2026). OpenCode workers' models sent the body as JSON text in quotes, OpenCode passed
  // it on as it came, and the office refused each write "expected object, received string" (the secretary, 1vBcuEtghSIh, read
  // part.state.input in the two failing runs' logs). One worker then wrote through a helper of its own with its run
  // key. The secretary's scope, 1vBcuEtghSIh and hquhMXN0XZpJ: refuse the string here and say whose it was; never parse it; and
  // every refused write says it is not to be sent another way.

  // Mutations, each alone: the string-body refusal taken out of askTheOffice (the office hears the string); the string
  // parsed for the caller instead (the office hears an object); the no-second-path sentence left off that refusal.
  it('11: refuses a body sent as a string, says the caller sent it so, and sends nothing', async () => {
    heard.length = 0
    for (const method of ['POST', 'PUT', 'PATCH']) {
      const refused = await call({ method, path: '/api/messages/a-message/mark', body: '{"mark": "seen"}' })
      expect(refused.result.isError, method).toBe(true)
      expect(refused.result.content).toEqual([{ type: 'text', text: A_STRING_BODY_IS_REFUSED }])
    }
    expect(heard, 'a body sent as a string reached the office').toHaveLength(0)
  })

  // Mutations, each alone: renderOfficeAnswer adds nothing to a refused write; it adds the sentence to a refused read too.
  it('12: tells the model never to send a write the office refused another way, and adds nothing to a read', async () => {
    const write = await call({ method: 'post', path: '/api/refused', body: { kind: 'note' } })
    expect(write.result.isError).toBe(false)
    expect(write.result.content[0]).toEqual({ type: 'text', text: `400\n{"error":"A synthetic refusal."}\n(${A_REFUSED_WRITE})` })
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      expect((await call({ method, path: '/api/refused', body: {} })).result.content[0].text, method).toBe(`400\n{"error":"A synthetic refusal."}\n(${A_REFUSED_WRITE})`)
    }
    expect((await call({ method: 'GET', path: '/api/refused' })).result.content[0].text).toBe('400\n{"error":"A synthetic refusal."}')
    expect((await call({ method: 'POST', path: '/api/records', body: {} })).result.content[0].text).toBe('200\n{"ok":true}')
  })

  // Mutations, each alone: the tool's own refusal of a write says nothing more; it says the sentence to a read too.
  it("13: tells the model never to send a write the tool itself refused another way, and adds nothing to a read's", async () => {
    heard.length = 0
    const write = await call({ method: 'POST', path: '/api/../x', body: {} })
    expect(write.result.isError).toBe(true)
    expect(write.result.content[0].text).toMatch(/^The path was refused/)
    expect(write.result.content[0].text.endsWith(` ${A_REFUSED_WRITE}`)).toBe(true)
    const read = await call({ method: 'GET', path: '/api/../x' })
    expect(read.result.isError).toBe(true)
    expect(read.result.content[0].text).toMatch(/^The path was refused/)
    expect(read.result.content[0].text).not.toContain(A_REFUSED_WRITE)
    expect(heard).toHaveLength(0)
  })
})

// THE WORDS, written out here so that a change to them is a change to this file.
const A_REFUSED_WRITE = 'This write was refused. Fix it and send it again through office_request, or end the step and name the refusal; never send it another way.'
const A_STRING_BODY_IS_REFUSED = 'The body was refused, and nothing was sent: it reached office_request as a string, as its caller sent it, ' +
  'and this tool never turns a body into a string. Send the body as a JSON object, not as JSON text in quotes. ' + A_REFUSED_WRITE
