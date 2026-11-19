// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OPENROUTER TOOL MINTS A TOOL TOKEN WITH ITS RUN'S OWN KEY AND USES THE OFFICE'S CARRYING ROUTE.
 *
 * The tool is run as a process of its own. A stand-in office answers the token door and the carrying route, and a
 * stand-in OpenRouter answers the model list, the key's limit and the chat call. The stand-in office forwards each
 * carried request to the stand-in OpenRouter, so the test can see which way the request went: the tool made no direct
 * call itself.
 *
 * NO REAL KEY, NO LIVE OFFICE, NO PROVIDER. Every key and token is made up for this file, and the tool is given a
 * stand-in address through main()'s `api`.
 */
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aToolRouteToTheProvider } from '../tools/provider-router-tool-calls.mjs'

const TOOL = fileURLToPath(new URL('../tools/openrouter.mjs', import.meta.url))
const MODEL = `made-up-video-model-${randomUUID()}`
const PRICES = { prompt: '0.00000075', completion: '0.00000375' }
const ANSWER = 'The made-up video shows a made-up arm reach a made-up cup.'
const USAGE = { prompt_tokens: 1200, completion_tokens: 40, total_tokens: 1240, cost: 0.001 }
const AGENT = 'openrouter-route-worker'
const RUN = `run-${randomUUID()}`
const RUN_KEY = randomBytes(32).toString('hex')
const TOOL_TOKEN = `mrt_${randomBytes(32).toString('base64url')}`

interface Asked {
  method: string
  path: string
  authorization: string | undefined
  key: string | undefined
  body: string
}

let upstream: Server
let office: Server
let upstreamPort = 0
let officePort = 0
let home = ''
let configuration = ''
let upstreamAsked: Asked[] = []
let officeAsked: Asked[] = []
let toolRequests: { provider: string; path: string; body?: unknown }[] = []
let minted: { run: string; provider: string; model: string }[] = []

/** One MP4 box: its size, its type, and what it holds. */
function box(type: string, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts)
  const head = Buffer.alloc(8)
  head.writeUInt32BE(8 + body.length, 0)
  head.write(type, 4, 'latin1')
  return Buffer.concat([head, body])
}

/** A small made-up MP4: a file-type box and a movie header that says its length. */
function anMp4(seconds: number): Buffer {
  const fileType = box('ftyp', Buffer.from('isom', 'latin1'), Buffer.from([0, 0, 2, 0]), Buffer.from('isommp41', 'latin1'))
  const header = Buffer.alloc(100)
  header.writeUInt32BE(1000, 12)
  header.writeUInt32BE(seconds * 1000, 16)
  return Buffer.concat([fileType, box('moov', box('mvhd', header)), box('mdat', randomBytes(2048))])
}

function aVideo(): string {
  const folder = join(home, 'clips')
  mkdirSync(folder, { recursive: true })
  const path = join(folder, 'clip.mp4')
  writeFileSync(path, anMp4(20))
  return path
}

function theBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((done, failed) => {
    const parts: Buffer[] = []
    req.on('data', (part: Buffer) => parts.push(part))
    req.on('end', () => done(Buffer.concat(parts).toString('utf8')))
    req.on('error', failed)
  })
}

beforeAll(async () => {
  upstream = createServer((req, res) => {
    void theBody(req).then((body) => {
      upstreamAsked.push({ method: req.method ?? '', path: req.url ?? '', authorization: req.headers.authorization, key: req.headers['x-mole-office-key'] as string | undefined, body })
      const send = (status: number, answer: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(answer))
      if (req.method === 'GET' && req.url === '/api/v1/models') {
        send(200, { data: [{ id: MODEL, architecture: { input_modalities: ['text', 'image', 'audio', 'video'] }, pricing: PRICES }] })
      } else if (req.method === 'GET' && req.url === '/api/v1/key') {
        send(200, { data: { label: 'stand-in', limit: null, limit_remaining: null, usage: 0 } })
      } else if (req.method === 'POST' && req.url === '/api/v1/chat/completions') {
        send(200, { id: 'gen-stand-in', model: MODEL, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: ANSWER } }], usage: USAGE })
      } else send(404, { error: 'the stand-in OpenRouter has no such door' })
    })
  })
  await new Promise<void>((done) => upstream.listen(0, '127.0.0.1', done))
  upstreamPort = (upstream.address() as AddressInfo).port

  office = createServer((req, res) => {
    void theBody(req).then(async (body) => {
      officeAsked.push({ method: req.method ?? '', path: req.url ?? '', authorization: req.headers.authorization, key: req.headers['x-mole-office-key'] as string | undefined, body })
      const send = (status: number, answer: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(answer))
      if (req.method === 'POST' && req.url === '/api/provider-router/tool-tokens') {
        const asked = JSON.parse(body) as { run: string; provider: string; model: string }
        minted.push(asked)
        if (req.headers['x-mole-office-key'] !== RUN_KEY) return send(403, { error: 'the stand-in office did not get the run key' })
        return send(201, { token: TOOL_TOKEN, id: `rt_${randomBytes(18).toString('base64url')}`, run: asked.run, expiresAt: Date.now() + 60_000, pairs: [{ provider: asked.provider, model: asked.model }], spendCap: 1 })
      }
      if (req.method === 'POST' && req.url === '/api/provider-router/tool-requests') {
        if (req.headers.authorization !== `Bearer ${TOOL_TOKEN}`) return send(401, { error: 'the stand-in office did not get the tool token' })
        const asked = JSON.parse(body) as { provider: string; path: string; body?: unknown }
        toolRequests.push(asked)
        const onward = await fetch(`http://127.0.0.1:${String(upstreamPort)}/api/v1${asked.path}`, asked.path === '/chat/completions'
          ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(asked.body) }
          : { method: 'GET' })
        const text = await onward.text()
        res.writeHead(onward.status, { 'content-type': onward.headers.get('content-type') ?? 'application/json' }).end(text)
        return
      }
      if (req.method === 'POST' && req.url === '/api/toolset/uses') return send(201, { written: true, run: RUN })
      send(404, { error: 'the stand-in office has no such door' })
    })
  })
  await new Promise<void>((done) => office.listen(0, '127.0.0.1', done))
  officePort = (office.address() as AddressInfo).port

  home = mkdtempSync(join(tmpdir(), 'mole-office-openrouter-route-'))
  const configFolder = join(home, 'config')
  mkdirSync(configFolder, { recursive: true, mode: 0o700 })
  configuration = join(configFolder, 'office-tool.json')
  writeFileSync(configuration, `${JSON.stringify({ mcpServers: { mole_office: { env: { MOLE_OFFICE_AGENT: AGENT, MOLE_OFFICE_SESSION: RUN, MOLE_AGENT_KEY: RUN_KEY } } } })}\n`, { mode: 0o600 })
}, 60_000)

afterAll(async () => {
  await new Promise<void>((done) => upstream?.close(() => done()))
  await new Promise<void>((done) => office?.close(() => done()))
  rmSync(home, { recursive: true, force: true })
})

interface Ran {
  code: number | null
  stdout: string
  stderr: string
}

function run(): Promise<Ran> {
  const env = {
    PATH: process.env['PATH'] ?? '',
    HOME: home,
    MOLE_OFFICE_API: `http://127.0.0.1:${String(officePort)}`,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_AGENT: AGENT,
    MOLE_OFFICE_SESSION: RUN,
    MOLE_OFFICE_TOOL_CONFIGURATION: configuration,
  }
  const over = { api: `http://127.0.0.1:${String(upstreamPort)}/api/v1`, waitMs: 20_000, envFile: join(home, 'no-such.env') }
  const code = `const { main } = await import(${JSON.stringify(pathToFileURL(TOOL).href)}); const [over, ...argv] = process.argv.slice(1); process.exitCode = await main(argv, JSON.parse(over))`
  return new Promise((done, failed) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, '--', JSON.stringify(over), 'video-review', '--file', aVideo(), '--prompt', 'Say what the made-up video shows.', '--model', MODEL], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')))
    const late = setTimeout(() => child.kill('SIGKILL'), 60_000)
    child.on('error', failed)
    child.on('close', (exit) => {
      clearTimeout(late)
      done({ code: exit, stdout, stderr })
    })
  })
}

/** The environment the helper reads its office, project, agent, run and run key from. */
const theStandInEnv = () => ({
  MOLE_OFFICE_API: `http://127.0.0.1:${String(officePort)}`,
  MOLE_OFFICE_WORKSPACE: 'default',
  MOLE_OFFICE_AGENT: AGENT,
  MOLE_OFFICE_SESSION: RUN,
  MOLE_OFFICE_TOOL_CONFIGURATION: configuration,
})

describe('the tool over the office route', () => {
  it('mints one token with the run’s own key, then carries the model list, the key and the chat call, and never calls OpenRouter itself', async () => {
    upstreamAsked = []
    officeAsked = []
    toolRequests = []
    minted = []
    const ran = await run()
    expect(ran.code, ran.stderr.slice(0, 1_000)).toBe(0)
    expect(ran.stdout).toBe(`${ANSWER}\n`)
    expect(ran.stderr).toContain(`Route: the provider router at http://127.0.0.1:${String(officePort)}`)
    // THE TOKEN WAS MINTED ONCE, WITH THE RUN'S OWN KEY AND ITS EXACT MODEL.
    expect(minted).toEqual([{ run: RUN, provider: 'openrouter', model: MODEL }])
    // EVERY REQUEST WENT TO THE OFFICE'S CARRYING ROUTE, IN THE ORDER THE TOOL MAKES THEM.
    expect(toolRequests.map((one) => `${one.provider} ${one.path}`)).toEqual([
      'openrouter /models', 'openrouter /key', 'openrouter /chat/completions',
    ])
    expect(officeAsked.filter((one) => one.path === '/api/provider-router/tool-requests')).toHaveLength(3)
    // THE STAND-IN OPENROUTER WAS REACHED BY THE OFFICE, NOT BY THE TOOL.
    expect(upstreamAsked.map((one) => `${one.method} ${one.path}`)).toEqual([
      'GET /api/v1/models', 'GET /api/v1/key', 'POST /api/v1/chat/completions',
    ])
    for (const one of upstreamAsked) expect(one.authorization, 'the tool sent a provider Authorization header itself').toBeUndefined()
    // NEITHER SECRET REACHES THE TOOL'S OUTPUT.
    expect(ran.stderr).not.toContain(RUN_KEY)
    expect(ran.stderr).not.toContain(TOOL_TOKEN)
  })

  it('leaves the tool token out of the run’s receipt log and out of what it prints', async () => {
    const ran = await run()
    expect(ran.code, ran.stderr.slice(0, 1_000)).toBe(0)
    const receipts = join(home, '.cache', 'mole-office', 'openrouter', 'receipts.jsonl')
    expect(existsSync(receipts), 'the tool wrote no receipt to grep').toBe(true)
    const log = readFileSync(receipts, 'utf8')
    for (const secret of [TOOL_TOKEN, RUN_KEY]) {
      expect(log.includes(secret), 'the run’s receipt log holds a credential').toBe(false)
      expect(ran.stderr.includes(secret), 'the run’s printed log holds a credential').toBe(false)
      expect(ran.stdout.includes(secret), 'the run’s answer holds a credential').toBe(false)
    }
  })

  it('leaves a tool on the office key file, and says so, when the endpoint it needs is not carried', async () => {
    const env = {
      MOLE_OFFICE_API: `http://127.0.0.1:${String(officePort)}`,
      MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_AGENT: AGENT,
      MOLE_OFFICE_SESSION: RUN,
      MOLE_OFFICE_TOOL_CONFIGURATION: configuration,
    }
    const at = await aToolRouteToTheProvider({ provider: 'openrouter', model: MODEL, endpoints: ['/embeddings'], env })
    expect(at.route).toBeNull()
    expect(at.why).toContain('does not carry /embeddings')
  })
})

describe('a 404 from the token door', () => {
  const answering = (answer: () => Response) => async () => answer()

  it('reads a 404 that says the run is not in this project as a refusal, and does not fall back', async () => {
    const said = `There is no run ${RUN} in this project. Nothing was done.`
    let asks = 0
    const at = await aToolRouteToTheProvider({
      provider: 'openrouter', model: MODEL, endpoints: ['/models'], env: theStandInEnv(),
      fetchImpl: async () => {
        asks++
        return new Response(JSON.stringify({ error: said }), { status: 404, headers: { 'content-type': 'application/json' } })
      },
    })
    expect(asks, 'the helper asked more than the token door').toBe(1)
    expect(at.route).toBeNull()
    expect(at.refused).toBe(true)
    expect(at.olderOffice).toBeUndefined()
    expect(at.why).toBe(said)
  })

  it('refuses any other 404, including another door’s No such endpoint and a body it cannot read', async () => {
    for (const answer of [
      () => new Response(JSON.stringify({ error: 'No such endpoint: POST /api/not-the-token-door. This server has families.' }), { status: 404 }),
      () => new Response(JSON.stringify({}), { status: 404 }),
      () => new Response(null, { status: 404 }),
      () => new Response('not JSON at all', { status: 404 }),
    ]) {
      const at = await aToolRouteToTheProvider({
        provider: 'openrouter', model: MODEL, endpoints: ['/models'], env: theStandInEnv(), fetchImpl: answering(answer),
      })
      expect(at.route).toBeNull()
      expect(at.refused).toBe(true)
      expect(at.olderOffice).toBeUndefined()
      expect(at.why).toContain('404')
      expect(at.why).toContain('did not say the tool-token door is missing')
      expect(at.why).toContain('does not fall back')
    }
  })

  it('reads a No such endpoint 404 that names the token door as an older office', async () => {
    let said = ''
    const at = await aToolRouteToTheProvider({
      provider: 'openrouter', model: MODEL, endpoints: ['/models'], env: theStandInEnv(),
      fetchImpl: async (url) => {
        said = `No such endpoint: POST ${new URL(String(url)).pathname}. This server has families.`
        return new Response(JSON.stringify({ error: said }), { status: 404, headers: { 'content-type': 'application/json' } })
      },
    })
    expect(at.route).toBeNull()
    expect(at.olderOffice).toBe(true)
    expect(at.refused).toBeUndefined()
    expect(at.why).not.toBe('')
  })
})

describe('a 409 for an unpriced model', () => {
  const noPriceTable = "No price table is set, so the office cannot count this run's spend against its cap. Nothing was issued."
  const noPriceForThisModel = `The price table names no price for ${MODEL}, so the office cannot count this run's spend against its cap. Nothing was issued.`
  const refusing = (error: string) => async () =>
    new Response(JSON.stringify({ error }), { status: 409, headers: { 'content-type': 'application/json' } })

  it('falls back on the price-table refusal for this model when the caller opts in', async () => {
    for (const said of [noPriceTable, noPriceForThisModel]) {
      const at = await aToolRouteToTheProvider({
        provider: 'openrouter', model: MODEL, endpoints: ['/models'], env: theStandInEnv(),
        fallBackWhenUnpriced: true, fetchImpl: refusing(said),
      })
      expect(at.route).toBeNull()
      expect(at.unpricedModel).toBe(true)
      expect(at.refused).toBeUndefined()
      expect(at.why).toBe(said)
    }
  })

  it('refuses the same price-table refusal when the caller did not opt in', async () => {
    for (const said of [noPriceTable, noPriceForThisModel]) {
      const at = await aToolRouteToTheProvider({
        provider: 'openrouter', model: MODEL, endpoints: ['/models'], env: theStandInEnv(), fetchImpl: refusing(said),
      })
      expect(at.route).toBeNull()
      expect(at.refused).toBe(true)
      expect(at.unpricedModel).toBeUndefined()
      expect(at.why).toBe(said)
    }
  })

  it('refuses any other 409 even when the caller opts in', async () => {
    for (const said of [
      "The price table names no price for another-model, so the office cannot count this run's spend against its cap. Nothing was issued.",
      'The price table is in GBP, and the run cap is in US dollars, so the office cannot count this run\'s spend against it. Nothing was issued.',
      'The office refused for another reason. Nothing was issued.',
    ]) {
      const at = await aToolRouteToTheProvider({
        provider: 'openrouter', model: MODEL, endpoints: ['/models'], env: theStandInEnv(),
        fallBackWhenUnpriced: true, fetchImpl: refusing(said),
      })
      expect(at.route).toBeNull()
      expect(at.refused).toBe(true)
      expect(at.unpricedModel).toBeUndefined()
      expect(at.why).toBe(said)
    }
  })
})
