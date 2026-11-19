// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT ON ANOTHER COMPUTER READS ITS KEY FROM A FILE, AND A FILE THAT IS NOT SAFE STARTS NOTHING.
 *
 * A Codex on the owner's Mac joins the office as an agent. tools/office-mcp.mjs takes its key
 * from the file MOLE_AGENT_KEY_FILE names, so the key is in no configuration and no shell. Agreed in
 * message aOvYSKXarQp2. Wave 13t, round 21.
 *
 * The real server process runs, with process.platform stood in as darwin by a preload, against an office stand-in on
 * a port of its own. Never the live office. Every key is synthetic.
 *
 * The file is read by for-agents/agent-key.mjs, the one reader of an agent's key, when the server starts and again for
 * each request, so the key is never put into the server's environment.
 *
 * Mutations, each tried alone after a control run, each red:
 *   - the key file not read for a request: case 1;
 *   - the mode check removed: case 2;
 *   - the open without O_NOFOLLOW: case 3;
 *   - the refusal of both MOLE_AGENT_KEY and the file removed: case 4.
 */
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { KEY_HEADER } from '../src/config/key-header.mjs'

const key = 'c3'.repeat(32)
const STAND_IN_DARWIN = "data:text/javascript,Object.defineProperty(process,'platform',{value:'darwin'})"
const REQUESTED_PATH = '/api/ping'
let api = ''
let office: Server
let folder = ''
const heard: { url: string; headers: IncomingHttpHeaders }[] = []

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'mac-agent-key-'))
  office = createServer((req, res) => {
    heard.push({ url: req.url ?? '', headers: req.headers })
    req.resume()
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"ok":true}')
  })
  await new Promise<void>((resolve) => office.listen(0, '127.0.0.1', () => resolve()))
  api = `http://127.0.0.1:${(office.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => office.close(() => resolve()))
  rmSync(folder, { recursive: true, force: true })
})

/** A key file in the test's own folder, with the given words and mode. */
function aKeyFile(name: string, words: string, mode = 0o600): string {
  const path = join(folder, name)
  writeFileSync(path, words)
  chmodSync(path, mode)
  return path
}

/** Starts the server as a Mac would, asks it one office_request, and gives back what it said and how it ended. */
function theServer(extra: Record<string, string>): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, ['--import', STAND_IN_DARWIN, 'tools/office-mcp.mjs'], {
    env: {
      PATH: process.env['PATH'] ?? '',
      HOME: folder,
      MOLE_OFFICE_API: api,
      MOLE_OFFICE_AGENT: 'synthetic-mac-codex',
      MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_SESSION: 'synthetic-session',
      ...extra,
    },
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (c) => { stdout += String(c) })
  child.stderr.on('data', (c) => { stderr += String(c) })
  // A server that refused has already gone; what is written to it then has nowhere to go.
  child.stdin.on('error', () => {})
  child.stdin.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'office_request', arguments: { method: 'GET', path: REQUESTED_PATH } } }) + '\n')
  return new Promise((resolve) => child.on('close', (code) => resolve({ code, stdout, stderr })))
}

/** A refusal: exit 1, a sentence, nothing sent and nothing answered, and no part of the key in what it said. */
async function refuses(extra: Record<string, string>, says: string) {
  const before = heard.length
  const ran = await theServer(extra)
  expect(ran.code).toBe(1)
  expect(ran.stderr).toContain(says)
  expect(ran.stderr).toContain('This server did not start and nothing was sent.')
  expect(ran.stderr).not.toContain(key.slice(0, 8))
  expect(ran.stdout).toBe('')
  expect(heard.length).toBe(before)
}

/** One requested call and its pending-mail checkpoint, each retaining the caller's key rules. */
function theCallsSince(before: number) {
  const calls = heard.slice(before)
  const requested = calls.filter(call => call.url === REQUESTED_PATH)
  const checkpoints = calls.filter(call => {
    const url = new URL(call.url, api)
    return url.pathname === '/api/messages' && url.searchParams.get('only') === 'waiting-for-me' &&
      url.searchParams.get('checkpoint') === '1'
  })
  expect(requested).toHaveLength(1)
  expect(checkpoints).toHaveLength(1)
  expect(calls).toHaveLength(requested.length + checkpoints.length)
  return calls
}

describe('an agent on a Mac reads its key from MOLE_AGENT_KEY_FILE', () => {
  it('1. a file of mode 600 holding one key, with a line end, sends that key on the key header', async () => {
    const before = heard.length
    const ran = await theServer({ MOLE_AGENT_KEY_FILE: aKeyFile('good', `${key}\n`) })
    expect(ran.stderr).toBe('')
    expect(ran.code).toBe(0)
    for (const call of theCallsSince(before)) {
      expect(call.headers[KEY_HEADER]).toBe(key)
      expect(call.headers['x-mole-office-actor-id']).toBe('synthetic-mac-codex')
    }
    expect(ran.stdout).not.toContain(key)
  })

  it('2. a file other users may read starts nothing', async () => {
    await refuses({ MOLE_AGENT_KEY_FILE: aKeyFile('open', key, 0o644) }, 'Run chmod 600 on it.')
  })

  it('3. a link to a good key file starts nothing', async () => {
    const link = join(folder, 'link')
    symlinkSync(aKeyFile('behind-the-link', key), link)
    await refuses({ MOLE_AGENT_KEY_FILE: link }, 'it is a link')
  })

  it('4. a key in the environment as well as the file starts nothing', async () => {
    await refuses({ MOLE_AGENT_KEY_FILE: aKeyFile('both', key), MOLE_AGENT_KEY: 'd4'.repeat(32) }, 'there are two keys')
  })

  it('5. a file that is not exactly one key starts nothing, and its words are not repeated', async () => {
    await refuses({ MOLE_AGENT_KEY_FILE: aKeyFile('short', key.slice(0, 40)) }, 'does not hold exactly one key of 64 hexadecimal characters')
    await refuses({ MOLE_AGENT_KEY_FILE: aKeyFile('two', `${key}\n${key}\n`) }, 'does not hold exactly one key of 64 hexadecimal characters')
  })

  it('6. a path that is not a full path, and a named pipe, start nothing and never wait', async () => {
    await refuses({ MOLE_AGENT_KEY_FILE: 'key.txt' }, 'must be a full path')
    const pipe = join(folder, 'pipe')
    execFileSync('mkfifo', [pipe])
    chmodSync(pipe, 0o600)
    await refuses({ MOLE_AGENT_KEY_FILE: pipe }, 'is not a regular file')
  })

  it('7. with no MOLE_AGENT_KEY_FILE nothing changes: no key, no key header', async () => {
    const before = heard.length
    const ran = await theServer({})
    expect(ran.stderr).toBe('')
    expect(ran.code).toBe(0)
    for (const call of theCallsSince(before)) expect(call.headers[KEY_HEADER]).toBeUndefined()
  })
})
