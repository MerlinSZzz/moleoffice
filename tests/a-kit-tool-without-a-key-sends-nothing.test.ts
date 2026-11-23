// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KIT SENDS ONLY ITS AGENT'S KEY OR ITS RUN'S KEY. These are the real four tools and the real
 * registration tool, started as children. Their office is a listener in this test; every key and
 * every identity it gives back is made up. No request reaches a real office.
 *
 * With neither key, or a configuration for another run, every writer refuses before any request,
 * even with an office key file beside the test database. A matching run configuration reaches the
 * listener with the run key on every request. Registration writes its key and prints an assignment,
 * never the key. Shell quoting is checked on Linux and Windows.
 *
 * Mutations for the supervisor: restore the office-key fallback; let any Python tool send without a
 * key; accept a different run's configuration; omit the run key header; print the registration key;
 * omit the final assignment; or remove either shell's quote escaping. The corresponding case fails.
 */
import { spawn } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { theLineThatSetsTheKeyFile, theNoKeyLine } from '../for-agents/agent-key.mjs'
import { theKeyARunsToolSends } from '../src/config/run-permissions.mjs'

const repo = fileURLToPath(new URL('..', import.meta.url))
const officeKey = 'a'.repeat(64)
const runKey = 'b'.repeat(64)
const agent = 'test-agent'
const session = 'test-run'
let dir = ''
let api = ''
const asked: Array<string | undefined> = []
const server = createServer((req, res) => {
  asked.push(typeof req.headers['x-mole-office-key'] === 'string' ? req.headers['x-mole-office-key'] : undefined)
  req.resume()
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(req.url?.includes('register-myself')
      ? { agent: { handle: agent }, headers: { 'x-mole-office-key': runKey } }
      : { record: { id: 'test-record' }, loginsWeek: { at: 'today', zone: 'UTC', logins: [], runsThatDeclaredNoTool: 0 } }))
  })
})

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kit-key-'))
  writeFileSync(join(dir, 'keys.json'), JSON.stringify({ office: officeKey, person: 'c'.repeat(64), providers: {} }), { mode: 0o600 })
  writeFileSync(join(dir, 'body'), 'made-up message')
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  rmSync(dir, { recursive: true, force: true })
})

function tools() {
  return [
    { command: 'python3', args: ['-B', join(repo, 'for-agents/send-message.py'), 'default', 'reader', 'A title', join(dir, 'body'), '--as', agent, '--session', session, '--api', api] },
    { command: 'python3', args: ['-B', join(repo, 'for-agents/mark-seen-in-the-office.py'), '--as', agent, '--api', api, 'test-message'] },
    { command: 'python3', args: ['-B', join(repo, 'for-agents/logins-week.py'), 'default', '--as', agent, '--api', api] },
    { command: process.execPath, args: [join(repo, 'for-agents/hold-the-handle.mjs'), '--agent', agent, '--session', session, '--api', api, '--workspace', 'default'] },
  ]
}

async function run(command: string, args: string[], env: Record<string, string>, stopAfterRequest = false) {
  const before = asked.length
  const child = spawn(command, args, { detached: true, cwd: dir, env: { PATH: process.env.PATH ?? '', HOME: dir, MOLE_OFFICE_DB: join(dir, 'office.db'), MOLE_OFFICE_SESSION: session, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''
  child.stdout.on('data', chunk => { stdout += String(chunk) })
  child.stderr.on('data', chunk => { stderr += String(chunk) })
  const kill = () => { if (child.pid !== undefined) { try { process.kill(-child.pid, 'SIGTERM') } catch { /* already ended */ } } }
  const poll = setInterval(() => { if (stopAfterRequest && asked.length > before) kill() }, 30)
  const timer = setTimeout(kill, 10_000)
  const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve) })
  clearInterval(poll)
  clearTimeout(timer)
  return { code, stdout, stderr, requests: asked.slice(before) }
}

for (const otherRun of [false, true]) {
  it(otherRun ? 'refuses a configuration for another run before asking' : 'refuses without a key even beside an office key file', async () => {
    const path = join(dir, 'another-run.json')
    writeFileSync(path, JSON.stringify({ mcpServers: { mole_office: { env: { MOLE_OFFICE_AGENT: agent, MOLE_OFFICE_SESSION: 'another-run', MOLE_AGENT_KEY: runKey } } } }), { mode: 0o600 })
    chmodSync(path, 0o600)
    const env: Record<string, string> = otherRun ? { MOLE_OFFICE_TOOL_CONFIGURATION: path } : {}
    const read = theKeyARunsToolSends(env, { agent, session })
    if (read.why === null) throw new Error('the case unexpectedly has a key')
    for (const tool of tools()) {
      const result = await run(tool.command, tool.args, env)
      expect(result.code).toBe(2)
      expect(result.stderr).toBe(theNoKeyLine(read.why, env) + '\n')
      expect(result.stderr).toContain('MOLE_AGENT_KEY_FILE')
      expect(result.stderr).not.toMatch(/[\\/]|[0-9a-f]{64}|[A-Za-z0-9_-]{43}/u)
      expect(result.requests).toEqual([])
    }
  }, 60_000)
}

it('sends the matching run key on every request', async () => {
  const path = join(dir, 'this-run.json')
  writeFileSync(path, JSON.stringify({ mcpServers: { mole_office: { env: { MOLE_OFFICE_AGENT: agent, MOLE_OFFICE_SESSION: session, MOLE_AGENT_KEY: runKey } } } }), { mode: 0o600 })
  for (const tool of tools()) {
    const result = await run(tool.command, tool.args, { MOLE_OFFICE_TOOL_CONFIGURATION: path }, true)
    expect(result.requests.length).toBeGreaterThan(0)
    expect(result.requests.every(key => key === runKey && key !== officeKey)).toBe(true)
  }
}, 60_000)

it('prints the key file assignment in plain and JSON registration output', async () => {
  for (const json of [false, true]) {
    const path = join(dir, json ? 'json-key' : 'plain-key')
    const result = await run(process.execPath, [join(repo, 'for-agents/register-myself.mjs'), '--handle', agent, '--name', 'Test agent', '--dir', dir, '--key-file', path, '--workspace', 'default', '--api', api, ...(json ? ['--json'] : [])], {})
    expect(result.code, result.stderr).toBe(0)
    const line = `export MOLE_AGENT_KEY_FILE='${path}'`
    if (json) expect((JSON.parse(result.stdout) as { setTheKeyFile: string }).setTheKeyFile).toBe(line)
    else expect(result.stdout.trimEnd().split('\n').at(-1)).toBe(line)
    expect(result.stdout + result.stderr).not.toContain(runKey)
  }
}, 30_000)

it('quotes a path for each shell', () => {
  expect(theLineThatSetsTheKeyFile("/a/b'c", 'linux')).toBe("export MOLE_AGENT_KEY_FILE='/a/b'\\''c'")
  expect(theLineThatSetsTheKeyFile("C:\\a'c", 'win32')).toBe("$env:MOLE_AGENT_KEY_FILE = 'C:\\a''c'")
})
